import type { TaskConfig, Where } from 'payload';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { Connections } from '../../../../packages/frogbot/src/connections/api.js';
import { createCredentialEncryption } from '../../../../packages/frogbot/src/connections/encryption.js';
import type { SanitizedConnectionsConfig } from '../../../../packages/frogbot/src/connections/types.js';
import { registerFrogBotInstance } from '../../../../packages/frogbot/src/instanceRegistry.js';
import { runKVLock } from '../../../../packages/frogbot/src/kv/lock.js';
import type { KVLock, KVLockCallback } from '../../../../packages/frogbot/src/kv/types.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import {
  resolvePollTasks,
  TRIGGER_POLL_TASK_SLUG,
} from '../../../../packages/frogbot/src/triggers/poll.js';
import { TriggerSubscriptions } from '../../../../packages/frogbot/src/triggers/subscriptions.js';
import type { IngressRegistry } from '../../../../packages/frogbot/src/triggers/types.js';

const calls: Array<{ type: string; client: unknown }> = [];

const createHook = definePiece({
  slug: 'hook',
  label: 'Hook',
  auth: z.object({ token: z.string().min(1) }),
  client: ({ auth }: { auth: unknown }) => ({ auth }),
  actions: [],
  triggers: [
    {
      slug: 'subscribed',
      type: 'webhook',
      description: 'Subscribed',
      input: z.object({ channel: z.string() }),
      onEnable({ client }) {
        calls.push({ type: 'enable', client });

        return Promise.resolve({ enabled: true });
      },
      onDisable({ client }) {
        calls.push({ type: 'disable', client });

        return Promise.resolve();
      },
      run: () => Promise.resolve([]),
    },
    {
      slug: 'polled',
      type: 'polling',
      description: 'Polled',
      input: z.object({}),
      run({ client }) {
        calls.push({ type: 'poll', client });

        return Promise.resolve({ events: [], cursor: 'now' });
      },
    },
  ],
});

function harness() {
  calls.length = 0;
  const hook = createHook({ auth: { token: 'factory' } });
  const webhookSubscriber = {
    agentSlug: 'ops',
    piece: hook,
    trigger: { trigger: hook.triggers.subscribed, input: { channel: 'a' }, handler: vi.fn() },
    input: { channel: 'a' },
  };

  const pollSubscriber = {
    agentSlug: 'ops',
    piece: hook,
    trigger: { trigger: hook.triggers.polled, input: {}, handler: vi.fn() },
    input: {},
    cron: '*/5 * * * *',
  };

  const docs: Array<Record<string, unknown>> = [];
  let nextId = 42;
  let held: (KVLock & { expiresAt: number }) | undefined;
  let token = 0;
  const kv = {
    acquireLock: vi.fn((key: string, ttl: number) => {
      if (held && held.expiresAt > Date.now()) return Promise.resolve(null);
      held = { key, token: String(++token), expiresAt: Date.now() + ttl };

      return Promise.resolve({ key, token: held.token });
    }),
    extendLock: vi.fn((lock: KVLock, ttl: number) => {
      if (held?.token !== lock.token) return Promise.resolve(false);
      held.expiresAt = Date.now() + ttl;

      return Promise.resolve(true);
    }),
    releaseLock: vi.fn((lock: KVLock) => {
      if (held?.token !== lock.token) return Promise.resolve(false);
      held = undefined;

      return Promise.resolve(true);
    }),
    lock: <T>(key: string, ttl: number, fn: KVLockCallback<T>) => runKVLock({ kv, key, ttl, fn }),
  };

  const config = {
    pieces: undefined,
    _internal: {
      payloadConfig: Promise.resolve({
        serverURL: 'https://frog.test',
        routes: { api: '/api' },
        admin: { user: 'users' },
      }),
      triggers: {
        hook: { instance: hook, subscribers: [webhookSubscriber, pollSubscriber] },
      } as IngressRegistry,
    },
  };

  const matches = (where: Where | undefined) => (doc: Record<string, unknown>) =>
    (where?.and ?? []).every((clause) =>
      Object.entries(clause).every(([field, condition]) => {
        const { equals } = condition as { equals?: unknown };

        return equals === undefined || doc[field] === equals;
      }),
    );

  const byId = (where: { id?: { equals: unknown }; and?: Array<{ id?: { equals: unknown } }> }) =>
    where?.id?.equals ?? where?.and?.find((part) => part.id)?.id?.equals;

  const frogbot = {
    config,
    find: vi.fn(({ collection, where }: { collection: string; where?: Where }) =>
      Promise.resolve({
        docs: collection === 'connections' ? [] : structuredClone(docs.filter(matches(where))),
        hasNextPage: false,
        nextPage: null,
      }),
    ),
    create: vi.fn(({ data }) => {
      const doc = { id: nextId++, ...structuredClone(data) };
      docs.push(doc);

      return Promise.resolve(structuredClone(doc));
    }),
    update: vi.fn(({ id, where, data }) => {
      const doc = docs.find((entry) => entry.id === (id ?? byId(where)));
      if (doc) Object.assign(doc, structuredClone(data));

      return Promise.resolve(id ? structuredClone(doc) : { docs: doc ? [doc] : [], errors: [] });
    }),
    delete: vi.fn(({ id }) => {
      docs.splice(
        docs.findIndex((entry) => entry.id === id),
        1,
      );

      return Promise.resolve();
    }),
    createRequest: vi.fn(),
    kv,
    logger: { warn: vi.fn() },
  };

  const connectionsConfig: SanitizedConnectionsConfig = {
    enabled: true,
    slug: 'connections',
    encryption: createCredentialEncryption({ secret: 'test' }),
    entries: {},
  };

  const connections = new Connections(frogbot as never, connectionsConfig);
  Object.assign(frogbot, { connections });
  frogbot.createRequest.mockImplementation(() => Promise.resolve({ frogbot, user: undefined }));

  const link = () => {
    connectionsConfig.entries.hook = { piece: hook, oauth: false, secret: true };
  };

  const payload = {};
  registerFrogBotInstance(payload, frogbot as never);
  const pollTask = resolvePollTasks({
    registry: config._internal.triggers,
    jobs: { tasks: [] },
  })!.tasks!.find(({ slug }) => slug === TRIGGER_POLL_TASK_SLUG) as TaskConfig;

  const poll = () =>
    pollTask.handler({
      input: { agentSlug: 'ops', instanceSlug: 'hook', triggerSlug: 'polled' },
      req: { payload },
    });

  return {
    hook,
    docs,
    frogbot,
    link,
    poll,
    webhookSubscriber,
    config,
    subscriptions: new TriggerSubscriptions(frogbot as never),
  };
}

const factoryClient = { auth: { token: 'factory' } };

describe('triggers on the instance named in a connections entry', () => {
  it('fails a poll with missing and marks the entry error, never using the code credential', async () => {
    const { docs, link, poll, subscriptions, frogbot } = harness();
    await subscriptions.reconcile();
    link();

    await poll();

    expect(frogbot.logger.warn).toHaveBeenCalledWith(expect.stringContaining('is not linked'));
    expect(docs.find((doc) => doc.trigger === 'polled')).toMatchObject({ status: 'error' });
    expect(calls).not.toContainEqual(expect.objectContaining({ type: 'poll' }));
  });

  it('disables a webhook subscription with the code credential', async () => {
    const { docs, link, subscriptions } = harness();
    await subscriptions.reconcile();
    const id = docs.find((doc) => doc.trigger === 'subscribed')!.id as number;
    link();

    await expect(subscriptions.disable(id)).resolves.toBeUndefined();
    expect(calls).toContainEqual({ type: 'disable', client: factoryClient });
    expect(docs.find((doc) => doc.id === id)).toBeUndefined();
  });

  it('cleans up a removed webhook mount on reconcile with the code credential', async () => {
    const { docs, link, subscriptions, config, frogbot, hook } = harness();
    await subscriptions.reconcile();
    link();
    config._internal.triggers.hook.subscribers = [];
    Object.assign(config, { pieces: { instances: [hook] } });

    await subscriptions.reconcile();

    expect(frogbot.logger.warn).not.toHaveBeenCalled();
    expect(calls).toContainEqual({ type: 'disable', client: factoryClient });
    expect(docs.filter((doc) => doc.trigger === 'subscribed')).toEqual([]);
  });
});
