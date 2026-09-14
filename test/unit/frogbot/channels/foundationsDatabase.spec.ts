import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BasePayload } from 'payload';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { sqliteAdapter } from '../../../../packages/db-sqlite/src/index.js';
import { resolveChannelChat } from '../../../../packages/frogbot/src/channels/conversation.js';
import { CHANNEL_TASK_SLUG } from '../../../../packages/frogbot/src/channels/host.js';
import { createChannelStateAdapter } from '../../../../packages/frogbot/src/channels/state.js';
import { resolveChannelTask } from '../../../../packages/frogbot/src/channels/task.js';
import { buildConfig } from '../../../../packages/frogbot/src/config/build.js';
import { type Frogbot, initFrogbotFromPayload } from '../../../../packages/frogbot/src/frogbot.js';
import { createSlackAdapter } from '../../../../packages/pieces/piece-slack/node_modules/@chat-adapter/slack/dist/index.js';
import { channelFixture } from './helpers.js';

describe('channel foundations with SQLite', () => {
  let directory: string;
  let frogbot: Frogbot;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'frogbot-channel-foundations-'));

    const config = await buildConfig({
      secret: 'channel-foundations-test-secret',
      db: sqliteAdapter({ client: { url: `file:${directory}/channels.db` }, push: true }),
      typescript: { autoGenerate: false },
      admin: { importMap: { autoGenerate: false } },
      jobs: { tasks: resolveChannelTask().tasks },
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'chats', chat: true, fields: [] },
      ],
    });
    const payload = await new BasePayload().init({
      config: config._internal.payloadConfig,
      disableOnInit: true,
    });

    frogbot = await initFrogbotFromPayload(payload, config, { disableOnInit: true });
  }, 30_000);

  afterAll(async () => {
    await frogbot?.destroy();

    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it.each([false, true])(
    'persists one job for a successful signed Slack delivery with SQLite state (retry header: %s)',
    async (retry) => {
      const signingSecret = 'sqlite-slack-test';
      const current = channelFixture({
        slug: `slack-sqlite-${retry}`,
        adapter: createSlackAdapter({ botToken: 'xoxb-test', botUserId: 'UBOT', signingSecret }),
      });
      const queue = vi.fn(frogbot.queue.bind(frogbot));

      Object.assign(current.frogbot, { kv: frogbot.kv, queue });

      const request = (redelivery: boolean) => {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const body = JSON.stringify({
          type: 'event_callback',
          event_id: `Ev-sqlite-${retry}`,
          team_id: 'T1',
          event: {
            type: 'app_mention',
            channel: 'C1',
            ts: '1.000001',
            text: 'Hello',
            user: 'U1',
            username: 'frog',
          },
        });
        const signature = createHmac('sha256', signingSecret)
          .update(`v0:${timestamp}:${body}`)
          .digest('hex');

        return new Request('http://localhost/webhook', {
          method: 'POST',
          body,
          headers: {
            'content-type': 'application/json',
            'x-slack-request-timestamp': timestamp,
            'x-slack-signature': `v0=${signature}`,
            ...(redelivery ? { 'x-slack-retry-num': '1' } : {}),
          },
        });
      };

      await current.host.initialize(false);

      try {
        expect((await current.host.webhook(`slack-sqlite-${retry}`, request(false)))?.status).toBe(
          200,
        );

        expect((await current.host.webhook(`slack-sqlite-${retry}`, request(retry)))?.status).toBe(
          200,
        );
        expect((await current.host.webhook(`slack-sqlite-${retry}`, request(true)))?.status).toBe(
          200,
        );
        expect(queue).toHaveBeenCalledOnce();

        const jobs = await frogbot.find({
          collection: 'payload-jobs',
          where: {
            and: [
              { taskSlug: { equals: CHANNEL_TASK_SLUG } },
              { 'input.instanceSlug': { equals: `slack-sqlite-${retry}` } },
            ],
          },
          overrideAccess: true,
        });

        expect(jobs.docs).toHaveLength(1);
        expect(jobs.docs[0].input.message.id).toBe('1.000001');
      } finally {
        await current.host.shutdown();
      }
    },
  );

  it('resolves concurrent first messages to one database-enforced conversation', async () => {
    const identity = {
      agent: 'support',
      piece: 'slack',
      account: 'slack-support',
      kind: 'thread',
      peer: 'C1',
      thread: 'slack:C1:123.456',
    };
    const requests = await Promise.all(Array.from({ length: 6 }, () => frogbot.createRequest()));

    const ids = await Promise.all(
      requests.map((req) => resolveChannelChat({ req, identity, user: null })),
    );
    const rows = await frogbot.find({ collection: 'chats', overrideAccess: true });

    expect(new Set(ids).size).toBe(1);
    expect(rows.docs).toHaveLength(1);

    await expect(
      frogbot.create({
        collection: 'chats',
        data: { channelKey: rows.docs[0]!.channelKey },
        overrideAccess: true,
      }),
    ).rejects.toThrow();

    await frogbot.create({ collection: 'chats', data: {}, overrideAccess: true });
    await frogbot.create({ collection: 'chats', data: {}, overrideAccess: true });

    expect((await frogbot.find({ collection: 'chats', overrideAccess: true })).docs).toHaveLength(
      3,
    );
  });

  it('serializes concurrent list appends from separate state adapters', async () => {
    const first = createChannelStateAdapter({ kv: frogbot.kv, namespace: 'list-concurrency' });
    const second = createChannelStateAdapter({ kv: frogbot.kv, namespace: 'list-concurrency' });

    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        (index % 2 ? first : second).appendToList('history', index),
      ),
    );

    expect((await first.getList<number>('history')).sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('honors value and list expiry and permits a new delivery claim after expiry', async () => {
    const first = createChannelStateAdapter({ kv: frogbot.kv, namespace: 'expiry' });
    const second = createChannelStateAdapter({ kv: frogbot.kv, namespace: 'expiry' });

    await first.set('value', 'expires', 50);
    await first.appendToList('history', 'expires', { ttlMs: 50 });
    await expect(first.setIfNotExists('delivery', true, 50)).resolves.toBe(true);
    await expect(second.setIfNotExists('delivery', true, 50)).resolves.toBe(false);
    await first.subscribe('thread');

    await vi.waitFor(async () => {
      expect(await second.get('value')).toBeNull();
      expect(await second.getList('history')).toEqual([]);
      expect(await second.get('delivery')).toBeNull();
    });

    await expect(second.setIfNotExists('delivery', true, 1000)).resolves.toBe(true);
    await expect(second.isSubscribed('thread')).resolves.toBe(true);
  });

  it('keeps successor locks safe from expired owners and forced releases', async () => {
    const first = createChannelStateAdapter({ kv: frogbot.kv, namespace: 'lock-expiry' });
    const second = createChannelStateAdapter({ kv: frogbot.kv, namespace: 'lock-expiry' });
    const expired = await first.acquireLock('thread', 50);

    await vi.waitFor(
      async () => {
        expect(await first.extendLock(expired!, 50)).toBe(false);
      },
      { interval: 60 },
    );

    const successor = await second.acquireLock('thread', 1000);

    expect(successor).not.toBeNull();

    await first.releaseLock(expired!);
    await expect(first.acquireLock('thread', 1000)).resolves.toBeNull();
    await second.forceReleaseLock('thread');

    const replacement = await first.acquireLock('thread', 1000);

    await second.releaseLock(successor!);

    await expect(first.extendLock(replacement!, 1000)).resolves.toBe(true);
    await first.releaseLock(replacement!);
  });
});
