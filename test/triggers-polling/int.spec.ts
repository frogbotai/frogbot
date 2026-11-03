import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Where } from 'payload';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import { pollControl, pollDeliveries, resetPollControl } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const subscriptionsSlug = 'frogbot-trigger-subscriptions';
const pollQueue = (agent: string, instance = 'poll') => `frogbot-poll:${agent}:${instance}:polled`;
const triggerQueue = (agent: string) => `frogbot-trigger:${agent}:polled`;

describe('polling triggers', () => {
  let booted: BootedFrogBot;

  const rows = async () =>
    (await booted.frogbot.triggers.list()).sort((a, b) => a.agent.localeCompare(b.agent));

  const row = async (agent: string) => (await rows()).find((entry) => entry.agent === agent);

  const setCursor = async (agent: string, state: { since: number }) =>
    booted.frogbot.update({
      collection: subscriptionsSlug,
      id: (await row(agent))!.id,
      data: { state: { value: state } },
      overrideAccess: true,
    });

  const jobs = async (where: Where) =>
    (
      await booted.payload.find({
        collection: 'payload-jobs',
        where,
        pagination: false,
        overrideAccess: true,
      })
    ).docs;

  const schedule = (agent: string, instance?: string) =>
    booted.frogbot.jobs.handleSchedules({ queue: pollQueue(agent, instance) });

  const poll = async (agent: string, instance?: string) => {
    const queue = pollQueue(agent, instance);

    await schedule(agent, instance);

    await booted.payload.update({
      collection: 'payload-jobs',
      where: { queue: { equals: queue } },
      data: { waitUntil: new Date(0).toISOString() },
      overrideAccess: true,
    });

    await booted.frogbot.jobs.run({ queue, overrideAccess: true });
  };

  const deliveryJobs = (agent: string) => jobs({ queue: { equals: triggerQueue(agent) } });

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  beforeEach(async () => {
    resetPollControl();
    pollDeliveries.length = 0;
    vi.restoreAllMocks();
    await booted.payload.delete({ collection: 'payload-jobs', where: {}, overrideAccess: true });
    await clearAndSeed(booted.frogbot, 'empty');
    await booted.frogbot.triggers.reconcile();
  });

  afterAll(async () => {
    await booted?.shutdown();
  });

  it('reconciles one active row per polling mount without serverURL', async () => {
    expect(booted.payload.config.serverURL).toBeFalsy();
    expect(await rows()).toEqual([
      expect.objectContaining({
        agent: 'hourly',
        instance: 'poll',
        trigger: 'polled',
        input: { value: { folder: 'sent' } },
        state: null,
        status: 'active',
      }),
      expect.objectContaining({
        agent: 'inbox',
        instance: 'poll',
        trigger: 'polled',
        input: { value: { folder: 'inbox' } },
        state: null,
        status: 'active',
      }),
      expect.objectContaining({
        agent: 'locked',
        instance: 'locked-poll',
        trigger: 'polled',
        state: null,
        status: 'active',
      }),
    ]);

    for (const entry of await rows()) expect(entry.webhookUrl).toBeFalsy();
  });

  it('keeps the cursor across reconciles and deletes the row of a removed mount', async () => {
    await setCursor('inbox', { since: 1 });

    await booted.frogbot.create({
      collection: subscriptionsSlug,
      data: {
        agent: 'removed',
        piece: 'poll',
        instance: 'poll',
        trigger: 'polled',
        input: { value: { folder: 'archive' } },
        inputHash: 'stale',
        state: { value: { since: 9 } },
        status: 'active',
      },
      overrideAccess: true,
    });

    await booted.frogbot.triggers.reconcile();

    expect((await rows()).map(({ agent, state }) => ({ agent, state }))).toEqual([
      { agent: 'hourly', state: null },
      { agent: 'inbox', state: { value: { since: 1 } } },
      { agent: 'locked', state: null },
    ]);
  });

  it('resets the cursor when enable changes the input', async () => {
    await setCursor('inbox', { since: 1 });
    const inbox = (await row('inbox'))!;

    const same = await booted.frogbot.triggers.enable({
      agent: 'inbox',
      instance: 'poll',
      trigger: 'polled',
    });

    expect(same).toMatchObject({ id: inbox.id, state: { value: { since: 1 } } });

    const changed = await booted.frogbot.triggers.enable({
      agent: 'inbox',
      instance: 'poll',
      trigger: 'polled',
      input: { folder: 'drafts' },
    });

    expect(changed).toMatchObject({
      id: inbox.id,
      input: { value: { folder: 'drafts' } },
      state: null,
      status: 'active',
    });

    await booted.frogbot.triggers.disable(inbox.id);

    expect((await rows()).map(({ agent }) => agent)).toEqual(['hourly', 'locked']);
  });

  it('stores a baseline on the first poll, then runs the handler once per new event', async () => {
    const tag = randomUUID();

    pollControl.run = () =>
      Promise.resolve({ events: [{ message: `${tag} old` }], cursor: { since: 1 } });

    await poll('inbox');

    expect(pollControl.calls).toEqual([{ input: { folder: 'inbox' }, cursor: undefined }]);
    expect(await row('inbox')).toMatchObject({ state: { value: { since: 1 } }, status: 'active' });
    expect(await deliveryJobs('inbox')).toEqual([]);

    pollControl.run = ({ cursor }) =>
      Promise.resolve({
        events: [{ message: `${tag} a` }, { message: `${tag} b` }],
        cursor: { since: cursor!.since + 1 },
      });

    await poll('inbox');

    expect(pollControl.calls[1]).toEqual({ input: { folder: 'inbox' }, cursor: { since: 1 } });
    expect(await row('inbox')).toMatchObject({ state: { value: { since: 2 } }, status: 'active' });
    expect(await deliveryJobs('inbox')).toHaveLength(2);

    await booted.frogbot.jobs.run({ queue: triggerQueue('inbox'), overrideAccess: true });

    expect(pollDeliveries).toEqual([
      { agent: 'inbox', event: { message: `${tag} a` } },
      { agent: 'inbox', event: { message: `${tag} b` } },
    ]);
  });

  it('stores a string cursor, which a bare json field would refuse, and dispatches on the next poll', async () => {
    const tag = randomUUID();

    pollControl.run = () => Promise.resolve({ events: [{ message: tag }], cursor: 'AAHx-dropbox' });

    await poll('inbox');

    expect(await row('inbox')).toMatchObject({
      state: { value: 'AAHx-dropbox' },
      status: 'active',
    });

    await poll('inbox');

    expect(await deliveryJobs('inbox')).toHaveLength(1);
  });

  it('dispatches from the second poll when the trigger returns no cursor', async () => {
    const tag = randomUUID();

    pollControl.run = () => Promise.resolve({ events: [{ message: tag }] });

    await poll('inbox');

    expect(await row('inbox')).toMatchObject({ state: {}, status: 'active' });
    expect(await deliveryJobs('inbox')).toEqual([]);

    await poll('inbox');
    await poll('inbox');

    expect(pollControl.calls.map(({ cursor }) => cursor)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(await deliveryJobs('inbox')).toHaveLength(1);
  });

  it('replays a poll whose cursor write failed without queueing duplicates', async () => {
    const tag = randomUUID();
    const warn = vi.spyOn(booted.frogbot.logger, 'warn');
    const update = booted.frogbot.update.bind(booted.frogbot);
    let failed = false;

    await setCursor('inbox', { since: 1 });

    pollControl.run = () => Promise.resolve({ events: [{ message: tag }], cursor: { since: 2 } });

    vi.spyOn(booted.frogbot, 'update').mockImplementation((args: Parameters<typeof update>[0]) => {
      if (
        !failed &&
        args.collection === subscriptionsSlug &&
        (args.data as { status?: string }).status === 'active'
      ) {
        failed = true;

        return Promise.reject(new Error('disk full'));
      }

      return update(args);
    });

    await poll('inbox');

    expect(failed).toBe(true);
    expect(await row('inbox')).toMatchObject({ state: { value: { since: 1 } }, status: 'error' });
    expect(await deliveryJobs('inbox')).toHaveLength(1);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "[frogbot] Poll of trigger 'poll/polled' for agent 'inbox' failed: disk full",
    );

    await poll('inbox');

    expect(pollControl.calls.map(({ cursor }) => cursor)).toEqual([{ since: 1 }, { since: 1 }]);
    expect(await row('inbox')).toMatchObject({ state: { value: { since: 2 } }, status: 'active' });
    expect(await deliveryJobs('inbox')).toHaveLength(1);
  });

  it('marks a failed poll as an error without retrying, and a later good poll as active', async () => {
    const warn = vi.spyOn(booted.frogbot.logger, 'warn');

    await poll('locked', 'locked-poll');

    expect(await row('locked')).toMatchObject({ state: null, status: 'error' });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "[frogbot] Poll of trigger 'locked-poll/polled' for agent 'locked' failed: Connection for 'locked-poll' is not linked.",
    );
    expect(await jobs({ queue: { equals: pollQueue('locked', 'locked-poll') } })).toEqual([
      expect.objectContaining({ completedAt: expect.any(String), hasError: false }),
    ]);

    pollControl.run = () => Promise.reject(new Error('vendor down'));
    await poll('inbox');

    expect(await row('inbox')).toMatchObject({ status: 'error' });

    resetPollControl();
    await poll('inbox');

    expect(await row('inbox')).toMatchObject({ state: { value: { since: 0 } }, status: 'active' });
  });

  it('queues one poll per subscription while one is waiting', async () => {
    await schedule('inbox');
    await schedule('inbox');

    expect(await jobs({ queue: { equals: pollQueue('inbox') } })).toEqual([
      expect.objectContaining({
        taskSlug: 'frogbot-poll-trigger',
        input: { agentSlug: 'inbox', instanceSlug: 'poll', triggerSlug: 'polled' },
      }),
    ]);
  });

  it('keeps a row deleted during a poll deleted', async () => {
    const inbox = (await row('inbox'))!;

    pollControl.run = async () => {
      await booted.frogbot.triggers.disable(inbox.id);

      return { events: [], cursor: { since: 5 } };
    };

    await poll('inbox');

    expect(await row('inbox')).toBeUndefined();
  });

  it('keeps the reset cursor of a row re-enabled during a poll', async () => {
    await setCursor('inbox', { since: 1 });

    pollControl.run = async () => {
      await booted.frogbot.triggers.enable({
        agent: 'inbox',
        instance: 'poll',
        trigger: 'polled',
        input: { folder: 'drafts' },
      });

      return { events: [], cursor: { since: 5 } };
    };

    await poll('inbox');

    expect(await row('inbox')).toMatchObject({
      input: { value: { folder: 'drafts' } },
      state: null,
      status: 'active',
    });
  });
});
