import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  addSpend,
  periodIn,
  readSpend,
  SPEND_COUNTERS_SLUG,
} from '../../packages/plugins/plugin-ai-policy/src/counters.js';
import { createResetTask } from '../../packages/plugins/plugin-ai-policy/src/reset.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('spend months in a configured time zone', () => {
  let booted: BootedFrogBot;
  let n = 0;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'api-keys-spend');
    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterAll(async () => {
    vi.useRealTimers();
    await booted.shutdown();
  });

  const account = async () => {
    n += 1;

    return booted.frogbot.create({
      collection: 'accounts',
      data: { email: `tz-${n}@example.com`, password: 'frogbot-test-password' },
      overrideAccess: true,
    }) as Promise<{ id: number | string }>;
  };

  const counter = async (id: number | string) => {
    const { docs } = await booted.frogbot.find({
      collection: SPEND_COUNTERS_SLUG,
      where: { key: { equals: `accounts:${String(id)}` } },
      overrideAccess: true,
      depth: 0,
    });

    return docs[0] as { amount: number; period: string } | undefined;
  };

  const req = () => ({ frogbot: booted.frogbot, context: {} }) as never;
  const options = (period: () => string) => ({ authCollection: 'accounts', period });

  it('rolls over at local midnight on the 1st in America/New_York', async () => {
    const { id } = await account();
    const ny = periodIn('America/New_York');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-01T04:59:30Z'));
    await addSpend(req(), { collection: 'accounts', id }, 2, options(ny));
    const before = await counter(id);

    vi.setSystemTime(new Date('2026-12-01T05:00:30Z'));
    await addSpend(req(), { collection: 'accounts', id }, 3, options(ny));
    await addSpend(req(), { collection: 'accounts', id }, 4, options(ny));
    const after = await counter(id);
    vi.useRealTimers();

    expect(before).toMatchObject({ period: '2026-11', amount: 2 });
    expect(after).toMatchObject({ period: '2026-12', amount: 7 });
  });

  it('records a cost when the counter is already in a later month', async () => {
    const { id } = await account();

    await addSpend(
      req(),
      { collection: 'accounts', id },
      5,
      options(() => '2026-12'),
    );

    await addSpend(
      req(),
      { collection: 'accounts', id },
      1,
      options(() => '2026-11'),
    );

    const total = await counter(id);

    expect(total?.period).toBe('2026-12');
    expect(Number(total?.amount)).toBe(6);
  });

  it('switching timeZone from Asia/Tokyo to UTC just after Tokyo midnight keeps the budget', async () => {
    const { id } = await account();
    const subject = { collection: 'accounts', id };

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-30T15:30:00Z'));
    await addSpend(req(), subject, 9, options(periodIn('Asia/Tokyo')));
    const seen =
      (await readSpend(req(), [subject], periodIn('UTC'))).get(`accounts:${String(id)}`) ?? 0;

    vi.useRealTimers();

    expect(seen).toBe(9);
  });

  it('reset with a non-UTC calendar zeros only earlier months', async () => {
    const a = await account();
    const b = await account();

    await addSpend(
      req(),
      { collection: 'accounts', id: a.id },
      5,
      options(() => '2026-11'),
    );

    await addSpend(
      req(),
      { collection: 'accounts', id: b.id },
      7,
      options(() => '2026-12'),
    );

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-30T23:30:00Z'));
    const task = createResetTask(periodIn('Asia/Tokyo'));
    await (task.handler as (args: unknown) => Promise<unknown>)({ req: req() });
    vi.useRealTimers();

    expect(await counter(a.id)).toMatchObject({ period: '2026-12', amount: 0 });
    expect(await counter(b.id)).toMatchObject({ period: '2026-12', amount: 7 });
  });
});
