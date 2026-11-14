import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  addSpend,
  readSpend,
  SPEND_COUNTERS_SLUG,
} from '../../packages/plugins/plugin-ai-policy/src/counters.js';
import { createResetTask } from '../../packages/plugins/plugin-ai-policy/src/reset.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('first spend races across months', () => {
  let booted: BootedFrogBot;
  let n = 0;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'api-keys-spend-attack');
    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  const account = async () => {
    n += 1;

    return booted.frogbot.create({
      collection: 'accounts',
      data: { email: `atk-${n}@example.com`, password: 'frogbot-test-password' },
      overrideAccess: true,
    }) as Promise<{ id: number | string }>;
  };

  const counters = async (id: number | string) => {
    const { docs } = await booted.frogbot.find({
      collection: SPEND_COUNTERS_SLUG,
      where: { key: { equals: `accounts:${String(id)}` } },
      overrideAccess: true,
      depth: 0,
    });

    return docs as unknown[] as { amount: number; period: string }[];
  };

  const bare = async () => {
    const a = await account();

    await booted.frogbot.delete({
      collection: SPEND_COUNTERS_SLUG,
      where: { key: { equals: `accounts:${String(a.id)}` } },
      overrideAccess: true,
    });

    return a;
  };

  const req = () => ({ frogbot: booted.frogbot, context: {} }) as never;
  const options = (p: string) => ({ authCollection: 'accounts', period: () => p });

  it('later-month process loses the race to create against an earlier-month process', async () => {
    const { id } = await bare();
    const subject = { collection: 'accounts', id };
    const fb = booted.frogbot;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let reached!: () => void;
    const reachedCreate = new Promise<void>((r) => (reached = r));
    const gatedDB = new Proxy(fb.db, {
      get(target, prop, recv) {
        if (prop === 'create') {
          return async (args: unknown) => {
            reached();
            await gate;

            return (target as never as { create: (a: unknown) => unknown }).create.call(
              target,
              args,
            );
          };
        }

        const v = Reflect.get(target, prop, recv);

        return typeof v === 'function' ? v.bind(target) : v;
      },
    });

    const gatedFB = new Proxy(fb, {
      get(target, prop, recv) {
        if (prop === 'db') return gatedDB;
        const v = Reflect.get(target, prop, recv);

        return typeof v === 'function' ? v.bind(target) : v;
      },
    });

    const dec = addSpend(
      { frogbot: gatedFB, context: {} } as never,
      subject,
      5,
      options('2026-12'),
    );

    await reachedCreate;
    await addSpend(req(), subject, 1, options('2026-11'));
    release();
    const result = await dec.then(
      () => 'ok',
      (e: unknown) => `threw: ${String(e).slice(0, 120)}`,
    );

    const rows = await counters(id);

    expect(result).toBe('ok');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ period: '2026-12' });
    expect(Number(rows[0]?.amount)).toBe(5);
  });

  it('parallel calls from processes on different months on an existing counter', async () => {
    const { id } = await account();
    const subject = { collection: 'accounts', id };
    await addSpend(req(), subject, 1, options('2026-11'));
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        addSpend(req(), subject, 1, options(i % 2 ? '2026-12' : '2026-11')),
      ),
    );

    const rows = await counters(id);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.period).toBe('2026-12');
    expect(Number(rows[0]?.amount)).toBeGreaterThanOrEqual(10);
    expect(Number(rows[0]?.amount)).toBeLessThanOrEqual(21);
  });

  it('parallel first calls on a fresh subject from different months', async () => {
    const { id } = await bare();
    const subject = { collection: 'accounts', id };
    const results = await Promise.allSettled([
      addSpend(req(), subject, 2, options('2026-11')),
      addSpend(req(), subject, 3, options('2026-12')),
      addSpend(req(), subject, 4, options('2026-11')),
      addSpend(req(), subject, 5, options('2026-12')),
    ]);

    const rows = await counters(id);

    expect(results.map((r) => (r.status === 'rejected' ? String(r.reason) : 'ok'))).toEqual([
      'ok',
      'ok',
      'ok',
      'ok',
    ]);
    expect(rows).toHaveLength(1);
  });

  it('readSpend with mixed months', async () => {
    const a = await account();
    const b = await account();
    const A = { collection: 'accounts', id: a.id };
    const B = { collection: 'accounts', id: b.id };
    await addSpend(req(), A, 2, options('2026-11'));
    await addSpend(req(), B, 3, options('2026-12'));
    const nov = await readSpend(req(), [A, B], () => '2026-11');
    const dec = await readSpend(req(), [A, B], () => '2026-12');

    expect([...nov.values()]).toEqual([2, 3]);
    expect([...dec.values()]).toEqual([0, 3]);
  });

  it('reset from a process behind leaves a later-month counter alone', async () => {
    const { id } = await account();
    const subject = { collection: 'accounts', id };
    await addSpend(req(), subject, 7, options('2027-01'));
    const task = createResetTask(() => '2026-12');
    await (task.handler as (args: unknown) => Promise<unknown>)({ req: req() });

    expect((await counters(id))[0]).toMatchObject({ period: '2027-01', amount: 7 });

    await addSpend(req(), subject, 1, options('2026-12'));

    expect((await counters(id))[0]).toMatchObject({ period: '2027-01', amount: 8 });
  });
});
