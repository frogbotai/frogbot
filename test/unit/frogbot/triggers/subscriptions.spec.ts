import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  KVLeaseLostError,
  KVLockContentionError,
} from '../../../../packages/frogbot/src/kv/errors.js';
import { runKVLock } from '../../../../packages/frogbot/src/kv/lock.js';
import type { KVLock, KVLockCallback } from '../../../../packages/frogbot/src/kv/types.js';
import {
  definePiece,
  pieceInstanceRuntime,
} from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { TriggerSubscriptions } from '../../../../packages/frogbot/src/triggers/subscriptions.js';
import type { IngressRegistry } from '../../../../packages/frogbot/src/triggers/types.js';
import { defineEchoPiece, echoCalls, resetEchoCalls } from './fixtures/piece-echo.js';

function createHarness({ serverURL = 'https://frog.test/', api = '/api' } = {}) {
  const instance = defineEchoPiece(definePiece)({ prefix: 'echo: ' });
  const hooks = pieceInstanceRuntime(instance).definition.triggers!.find(
    ({ slug }) => slug === 'subscribed',
  ) as typeof instance.triggers.subscribed;
  const subscriber = {
    agentSlug: 'ops',
    piece: instance,
    trigger: {
      trigger: instance.triggers.subscribed,
      input: { channel: 'alerts' },
      handler: vi.fn(),
    },
    input: { channel: 'alerts' },
  };
  const docs: Array<Record<string, unknown>> = [];
  let nextId = 42;
  let held: (KVLock & { expiresAt: number }) | undefined;
  let nextToken = 0;
  const kv = {
    acquireLock: vi.fn(async (key: string, ttl: number) => {
      if (held && held.expiresAt > Date.now()) return null;
      held = { key, token: String(++nextToken), expiresAt: Date.now() + ttl };
      return { key, token: held.token };
    }),
    extendLock: vi.fn(async (lock: KVLock, ttl: number) => {
      if (held?.token !== lock.token || held.expiresAt <= Date.now()) return false;
      held.expiresAt = Date.now() + ttl;
      return true;
    }),
    releaseLock: vi.fn(async (lock: KVLock) => {
      if (held?.token !== lock.token) return false;
      held = undefined;
      return true;
    }),
    lock: <T>(key: string, ttl: number, fn: KVLockCallback<T>) => runKVLock({ kv, key, ttl, fn }),
  };
  const config = {
    pieces: undefined as { instances: (typeof instance)[] } | undefined,
    _internal: {
      payloadConfig: Promise.resolve({ serverURL, routes: { api } }),
      triggers: { echo: { instance, subscribers: [subscriber] } } as IngressRegistry,
    },
  };
  const frogbot = {
    config,
    find: vi.fn(async ({ pagination = true, limit, page = 1 }) => {
      const size = limit ?? (pagination ? 10 : docs.length);
      const start = (page - 1) * size;
      return {
        docs: JSON.parse(JSON.stringify(docs.slice(start, start + size))),
        hasNextPage: start + size < docs.length,
        nextPage: start + size < docs.length ? page + 1 : null,
      };
    }),
    create: vi.fn(async ({ data }) => {
      const doc = { id: nextId++, ...JSON.parse(JSON.stringify(data)) };
      docs.push(doc);
      return structuredClone(doc);
    }),
    update: vi.fn(async ({ id, data }) => {
      const doc = docs.find((entry) => entry.id === id)!;
      Object.assign(doc, JSON.parse(JSON.stringify(data)));
      return structuredClone(doc);
    }),
    delete: vi.fn(async ({ id }) => {
      docs.splice(
        docs.findIndex((entry) => entry.id === id),
        1,
      );
    }),
    createRequest: vi.fn(),
    kv,
    logger: { warn: vi.fn() },
  };
  frogbot.createRequest.mockResolvedValue({ frogbot });
  const subscriptions = new TriggerSubscriptions(frogbot as never);
  const target = { agent: 'ops', instance: 'echo', trigger: 'subscribed' };
  return { instance, hooks, subscriber, docs, config, frogbot, subscriptions, target };
}

describe('trigger subscriptions', () => {
  beforeEach(resetEchoCalls);
  afterEach(() => vi.useRealTimers());

  it('lists and reconciles every subscription beyond the default ten-row page', async () => {
    const { config, subscriber, docs, subscriptions, frogbot } = createHarness();
    config._internal.triggers.echo.subscribers = Array.from({ length: 23 }, (_, index) => ({
      ...subscriber,
      agentSlug: `agent-${index}`,
    }));
    await subscriptions.reconcile();
    expect(await subscriptions.list()).toHaveLength(23);
    await subscriptions.reconcile();
    expect(docs).toHaveLength(23);
    expect(echoCalls.filter(({ type }) => type === 'enable')).toHaveLength(23);
    config._internal.triggers.echo.subscribers = [];
    await subscriptions.reconcile();
    expect(frogbot.delete).toHaveBeenCalledTimes(23);
    expect(docs).toEqual([]);
  });

  it('uses the runtime API to enable, change input, and disable provider subscriptions', async () => {
    const { subscriptions, target, docs } = createHarness();
    const enabled = await subscriptions.enable(target);
    expect(enabled).toMatchObject({
      id: 42,
      status: 'active',
      state: { enabled: 'alerts' },
      webhookUrl: 'https://frog.test/api/webhooks/echo/42',
    });
    await subscriptions.enable(target);
    expect(echoCalls.filter(({ type }) => type === 'enable')).toHaveLength(1);
    await subscriptions.enable({ ...target, input: { channel: 'incidents' } });
    expect(echoCalls.map(({ type }) => type)).toEqual(['enable', 'disable', 'enable']);
    expect(echoCalls[1]).toMatchObject({
      input: { channel: 'alerts' },
      state: { enabled: 'alerts' },
      options: { prefix: 'echo: ' },
      client: { prefix: 'echo: ' },
    });
    await subscriptions.disable(enabled.id);
    expect(echoCalls.at(-1)).toMatchObject({
      type: 'disable',
      input: { channel: 'incidents' },
      state: { enabled: 'incidents' },
    });
    expect(docs).toEqual([]);
  });

  it('rejects undeclared and invalid runtime subscriptions before persistence', async () => {
    const { subscriptions, target, docs } = createHarness();
    await expect(subscriptions.enable({ ...target, agent: 'missing' })).rejects.toThrow();
    await expect(subscriptions.enable({ ...target, input: { channel: 5 } })).rejects.toThrow();
    expect(docs).toEqual([]);
    expect(echoCalls).toEqual([]);
  });

  it('retains prior input and state when changed-input cleanup fails, then retries cleanup', async () => {
    const { hooks, subscriber, subscriptions, docs, frogbot } = createHarness();
    await subscriptions.reconcile();
    const prior = structuredClone(docs[0]);
    const onDisable = hooks.onDisable;
    const disable = vi
      .spyOn(hooks, 'onDisable')
      .mockRejectedValueOnce(new Error('cleanup unavailable'));
    subscriber.input = subscriber.trigger.input = { channel: 'incidents' };
    await subscriptions.reconcile();
    expect(docs[0]).toMatchObject({
      ...prior,
      status: 'error',
      cleanupPending: true,
    });
    expect(echoCalls.filter(({ type }) => type === 'enable')).toHaveLength(1);
    expect(frogbot.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('cleanup unavailable'),
    );
    disable.mockImplementation(onDisable);
    await subscriptions.reconcile();
    expect(disable).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: { channel: 'alerts' },
        state: { enabled: 'alerts' },
      }),
    );
    expect(docs[0]).toMatchObject({
      status: 'active',
      input: { value: { channel: 'incidents' } },
      state: { enabled: 'incidents' },
    });
  });

  it('retries pending cleanup even if declared input returns to its prior value', async () => {
    const { hooks, subscriber, subscriptions, docs } = createHarness();
    await subscriptions.reconcile();
    const disable = vi
      .spyOn(hooks, 'onDisable')
      .mockRejectedValueOnce(new Error('cleanup unavailable'));
    subscriber.input = subscriber.trigger.input = { channel: 'incidents' };
    await subscriptions.reconcile();
    subscriber.input = subscriber.trigger.input = { channel: 'alerts' };
    await subscriptions.reconcile();
    expect(disable).toHaveBeenCalledTimes(2);
    expect(docs[0]).toMatchObject({ status: 'active', cleanupPending: false });
  });

  it('retries failed enables without carrying state from a disabled subscription', async () => {
    const { hooks, subscriber, subscriptions, docs } = createHarness();
    await subscriptions.reconcile();
    const enable = vi
      .spyOn(hooks, 'onEnable')
      .mockRejectedValueOnce(new Error('enable unavailable'));
    subscriber.input = subscriber.trigger.input = { channel: 'incidents' };
    await subscriptions.reconcile();
    expect(docs[0]).toMatchObject({
      status: 'error',
      input: { value: { channel: 'incidents' } },
      state: null,
    });
    await subscriptions.reconcile();
    expect(enable).toHaveBeenCalledTimes(2);
    expect(echoCalls.filter(({ type }) => type === 'disable')).toHaveLength(1);
    expect(docs[0]).toMatchObject({ status: 'active', state: { enabled: 'incidents' } });
  });

  it('retains failed orphan cleanup and retries using registry instances without config.pieces', async () => {
    const { hooks, config, subscriptions, docs, frogbot } = createHarness();
    await subscriptions.reconcile();
    const prior = structuredClone(docs[0]);
    config._internal.triggers.echo.subscribers = [];
    vi.spyOn(hooks, 'onDisable').mockRejectedValueOnce(new Error('vendor offline'));
    await subscriptions.reconcile();
    expect(docs[0]).toMatchObject({ ...prior, status: 'error', cleanupPending: true });
    expect(frogbot.delete).not.toHaveBeenCalled();
    await subscriptions.reconcile();
    expect(docs).toEqual([]);
  });

  it('retains orphan records when mounts and credentials are no longer available', async () => {
    const { config, subscriptions, docs, frogbot } = createHarness();
    await subscriptions.reconcile();
    const prior = structuredClone(docs[0]);
    config._internal.triggers = {};
    await subscriptions.reconcile();
    expect(docs[0]).toMatchObject({ ...prior, status: 'error', cleanupPending: true });
    expect(frogbot.delete).not.toHaveBeenCalled();
    expect(frogbot.logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/credentials.*database/i),
    );
  });

  it('can clean removed mounts with an optional legacy configured instance', async () => {
    const { instance, config, subscriptions, docs } = createHarness();
    await subscriptions.reconcile();
    config._internal.triggers = {};
    config.pieces = { instances: [instance] };
    await subscriptions.reconcile();
    expect(docs).toEqual([]);
    expect(echoCalls.at(-1)).toMatchObject({ type: 'disable', state: { enabled: 'alerts' } });
  });

  it('retains cleanup rows when the trigger hook is unavailable', async () => {
    const { config, subscriptions, docs, frogbot } = createHarness();
    await subscriptions.reconcile();
    docs[0].trigger = 'removed-trigger';
    config._internal.triggers.echo.subscribers = [];
    await subscriptions.reconcile();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ status: 'error', cleanupPending: true });
    expect(frogbot.delete).not.toHaveBeenCalled();
    expect(frogbot.logger.warn).toHaveBeenCalledWith(expect.stringContaining('removed-trigger'));
  });

  it('retains failed public disables and reports the failure to the caller', async () => {
    const { hooks, subscriptions, docs } = createHarness();
    await subscriptions.reconcile();
    vi.spyOn(hooks, 'onDisable').mockRejectedValueOnce(new Error('vendor offline'));
    await expect(subscriptions.disable(42)).rejects.toThrow('vendor offline');
    expect(docs[0]).toMatchObject({
      status: 'error',
      cleanupPending: true,
      state: { enabled: 'alerts' },
    });
    await subscriptions.disable(42);
    expect(docs).toEqual([]);
  });

  it.each(['/backend/v1/', '/', ''])('uses configured API callback path %j', async (api) => {
    const { subscriptions, docs } = createHarness({ api });
    await subscriptions.reconcile();
    const path = api.replace(/^\/+|\/+$/g, '');
    expect(docs[0].webhookUrl).toBe(`https://frog.test/${path ? `${path}/` : ''}webhooks/echo/42`);
  });

  it('re-registers callbacks when the configured API route changes', async () => {
    const { subscriptions, config, docs } = createHarness();
    await subscriptions.reconcile();
    config._internal.payloadConfig = Promise.resolve({
      serverURL: 'https://frog.test/',
      routes: { api: '/backend' },
    });
    await subscriptions.reconcile();
    expect(echoCalls.map(({ type }) => type)).toEqual(['enable', 'disable', 'enable']);
    expect(docs[0].webhookUrl).toBe('https://frog.test/backend/webhooks/echo/42');
  });

  it('requires serverURL only for declared webhook subscriptions', async () => {
    const { subscriptions, config, subscriber, instance, frogbot } = createHarness({
      serverURL: '',
    });
    config._internal.triggers.echo.subscribers = [
      {
        ...subscriber,
        trigger: { trigger: instance.triggers.received, handler: vi.fn() },
        input: {},
      },
    ];
    await expect(subscriptions.reconcile()).resolves.toBeUndefined();
    config._internal.triggers.echo.subscribers = [subscriber];
    await expect(subscriptions.reconcile()).rejects.toThrow('serverURL');
    expect(frogbot.kv.releaseLock).toHaveBeenCalledTimes(2);
  });

  it('renews a 60_000ms lock for slow hooks and excludes concurrent reconciliation and public mutations', async () => {
    vi.useFakeTimers();
    const { hooks, subscriptions, target, frogbot, docs } = createHarness();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const enable = vi.spyOn(hooks, 'onEnable').mockImplementationOnce(async () => {
      await pending;
      return { enabled: 'alerts' };
    });
    const first = subscriptions.reconcile();
    await vi.advanceTimersByTimeAsync(70_000);
    expect(frogbot.kv.acquireLock).toHaveBeenCalledWith('trigger:reconcile', 60_000);
    expect(frogbot.kv.extendLock).toHaveBeenCalledTimes(3);
    const replica = new TriggerSubscriptions(frogbot as never);
    await replica.reconcile();
    await expect(replica.enable(target)).rejects.toBeInstanceOf(KVLockContentionError);
    await expect(replica.disable(42)).rejects.toBeInstanceOf(KVLockContentionError);
    expect(enable).toHaveBeenCalledTimes(1);
    expect(frogbot.delete).not.toHaveBeenCalled();
    finish();
    await first;
    await replica.reconcile();
    expect(enable).toHaveBeenCalledTimes(1);
    expect(docs[0].status).toBe('active');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('compensates a successful enable after lease loss under a fresh lock', async () => {
    vi.useFakeTimers();
    const { hooks, subscriptions, frogbot, docs } = createHarness();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.spyOn(hooks, 'onEnable').mockImplementationOnce(async () => {
      await pending;
      return { enabled: 'alerts' };
    });
    frogbot.kv.extendLock.mockResolvedValueOnce(false);
    const result = subscriptions.reconcile().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toBeInstanceOf(KVLeaseLostError);
    const disable = vi.spyOn(hooks, 'onDisable');
    await subscriptions.reconcile();
    expect(frogbot.create).toHaveBeenCalledTimes(1);
    expect(docs[0]).toMatchObject({ status: 'error', enablePending: true });
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(disable).toHaveBeenCalledWith(expect.objectContaining({ state: { enabled: 'alerts' } }));
    expect(frogbot.kv.acquireLock).toHaveBeenCalledTimes(3);
    expect(docs[0]).toMatchObject({ status: 'error', enablePending: false, state: null });
  });

  it.each(['disable', 'reconcile'] as const)(
    'removes never-enabled rows through %s without calling onDisable',
    async (operation) => {
      const { hooks, subscriptions, target, config, docs } = createHarness();
      vi.spyOn(hooks, 'onEnable').mockRejectedValueOnce(new Error('enable failed'));
      const disable = vi.spyOn(hooks, 'onDisable');
      await expect(subscriptions.enable(target)).rejects.toThrow('enable failed');
      expect(docs[0]).toMatchObject({ status: 'error', state: null, cleanupPending: false });
      config._internal.triggers = {};
      if (operation === 'disable') await subscriptions.disable(42);
      else await subscriptions.reconcile();
      expect(disable).not.toHaveBeenCalled();
      expect(docs).toEqual([]);
    },
  );

  it('compensates a failed final write with the exact enabled state, input, client, and request', async () => {
    const { hooks, subscriptions, target, frogbot, docs } = createHarness();
    const enable = vi.spyOn(hooks, 'onEnable').mockImplementationOnce(async (args) => {
      frogbot.update.mockRejectedValueOnce(new Error('final write failed'));
      return { enabled: args.input.channel };
    });
    const disable = vi.spyOn(hooks, 'onDisable');
    await expect(subscriptions.enable(target)).rejects.toThrow('final write failed');
    const enabled = enable.mock.calls[0][0];
    const disabled = disable.mock.calls[0][0];
    expect(disabled.input).toBe(enabled.input);
    expect(disabled.client).toBe(enabled.client);
    expect(disabled.req).toBe(enabled.req);
    expect(disabled.options).toBe(enabled.options);
    expect(disabled.state).toEqual({ enabled: 'alerts' });
    expect(docs[0]).toMatchObject({
      status: 'error',
      state: null,
      cleanupPending: false,
      enablePending: false,
    });
    await subscriptions.enable(target);
    expect(enable).toHaveBeenCalledTimes(2);
    expect(disable).toHaveBeenCalledTimes(1);
  });

  it('persists returned state when final-write compensation fails and retries cleanup before enable', async () => {
    const { hooks, subscriptions, target, frogbot, docs } = createHarness();
    vi.spyOn(hooks, 'onEnable').mockImplementationOnce(async () => {
      frogbot.update.mockRejectedValueOnce(new Error('final write failed'));
      return { enabled: 'alerts' };
    });
    const disable = vi
      .spyOn(hooks, 'onDisable')
      .mockRejectedValueOnce(new Error('compensation failed'));
    await expect(subscriptions.enable(target)).rejects.toThrow('final write failed');
    expect(docs[0]).toMatchObject({
      status: 'error',
      state: { enabled: 'alerts' },
      cleanupPending: true,
      enablePending: false,
    });
    await subscriptions.enable(target);
    expect(disable).toHaveBeenCalledTimes(2);
    expect(disable).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: { enabled: 'alerts' } }),
    );
    expect(docs[0].status).toBe('active');
  });

  it('retains unresolved enable attempts across restarts rather than enabling or deleting them', async () => {
    const { subscriptions, target, docs, frogbot, config, hooks } = createHarness();
    await subscriptions.enable(target);
    Object.assign(docs[0], {
      status: 'error',
      state: null,
      cleanupPending: false,
      enablePending: true,
    });
    const enable = vi.spyOn(hooks, 'onEnable');
    const disable = vi.spyOn(hooks, 'onDisable');
    const restarted = new TriggerSubscriptions(frogbot as never);
    await expect(restarted.enable(target)).rejects.toThrow(/unresolved/i);
    config._internal.triggers = {};
    await restarted.reconcile();
    await expect(restarted.disable(42)).rejects.toThrow(/unresolved/i);
    expect(docs).toHaveLength(1);
    expect(enable).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
  });

  it('stores raw input and rehydrates schema transforms for cleanup after JSON persistence', async () => {
    const { hooks, subscriber, subscriptions, target, docs, frogbot } = createHarness();
    const schema = z.object({ channel: z.string() }).transform(({ channel }) => ({
      channel: new Date(channel),
    }));
    Object.assign(hooks, { input: schema });
    subscriber.trigger.trigger = { ...subscriber.trigger.trigger, input: schema } as never;
    subscriber.trigger.input = { channel: '2026-09-12T00:00:00.000Z' };
    subscriber.input = schema.parse(subscriber.trigger.input) as never;
    const enable = vi.spyOn(hooks, 'onEnable').mockResolvedValue({ enabled: 'date' });
    const disable = vi.spyOn(hooks, 'onDisable');
    await subscriptions.reconcile();
    expect(enable.mock.calls[0][0].input.channel).toBeInstanceOf(Date);
    expect(docs[0].input).toEqual({ value: { channel: '2026-09-12T00:00:00.000Z' } });
    const restarted = new TriggerSubscriptions(frogbot as never);
    await restarted.enable({ ...target, input: { channel: '2026-09-13T00:00:00.000Z' } });
    expect(disable.mock.calls[0][0].input.channel).toEqual(new Date('2026-09-12T00:00:00.000Z'));
    await restarted.disable(42);
    expect(disable.mock.calls[1][0].input.channel).toEqual(new Date('2026-09-13T00:00:00.000Z'));
  });

  it('preserves omitted input versus explicit null and uses the registry fallback for omitted input', async () => {
    const { hooks, subscriber, subscriptions, target, docs } = createHarness();
    const schema = z.object({ channel: z.string().default('fallback') }).nullable();
    Object.assign(hooks, { input: schema });
    subscriber.trigger.trigger = { ...subscriber.trigger.trigger, input: schema } as never;
    const enable = vi.spyOn(hooks, 'onEnable').mockResolvedValue({ enabled: 'fallback' });
    const disable = vi.spyOn(hooks, 'onDisable');
    await subscriptions.enable({ ...target, input: undefined });
    expect(docs[0].input).toEqual({});
    expect(enable.mock.calls[0][0].input).toEqual({ channel: 'fallback' });
    await subscriptions.enable({ ...target, input: null });
    expect(docs[0].input).toEqual({ value: null });
    expect(disable.mock.calls[0][0].input).toEqual({ channel: 'fallback' });
    expect(enable.mock.calls[1][0].input).toBeNull();
  });

  it('persists failed compensation state under a fresh lease for another runtime to clean up', async () => {
    vi.useFakeTimers();
    const { hooks, subscriptions, frogbot, docs } = createHarness();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.spyOn(hooks, 'onEnable').mockImplementationOnce(async () => {
      await pending;
      return { enabled: 'alerts' };
    });
    const disable = vi.spyOn(hooks, 'onDisable').mockRejectedValueOnce(new Error('vendor offline'));
    frogbot.kv.extendLock.mockResolvedValueOnce(false);
    const result = subscriptions.reconcile().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toBeInstanceOf(KVLeaseLostError);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(docs[0]).toMatchObject({
      status: 'error',
      enablePending: false,
      cleanupPending: true,
      state: { enabled: 'alerts' },
    });
    await new TriggerSubscriptions(frogbot as never).disable(42);
    expect(disable).toHaveBeenCalledTimes(2);
    expect(disable).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: { enabled: 'alerts' } }),
    );
    expect(docs).toEqual([]);
  });

  it('defers compensation when a replacement lease is busy and retains the returned state', async () => {
    vi.useFakeTimers();
    const { hooks, subscriptions, frogbot, docs } = createHarness();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const enable = vi.spyOn(hooks, 'onEnable').mockImplementationOnce(async () => {
      await pending;
      return { enabled: 'alerts' };
    });
    const disable = vi.spyOn(hooks, 'onDisable');
    frogbot.kv.extendLock.mockResolvedValueOnce(false);
    const result = subscriptions.reconcile().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toBeInstanceOf(KVLeaseLostError);
    const writes = frogbot.update.mock.calls.length;
    frogbot.kv.acquireLock.mockResolvedValueOnce(null);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(frogbot.update).toHaveBeenCalledTimes(writes);
    expect(disable).not.toHaveBeenCalled();
    expect(docs[0]).toMatchObject({ enablePending: true, state: null });
    await subscriptions.disable(42);
    expect(disable).toHaveBeenCalledTimes(1);
    expect(disable.mock.calls[0][0].client).toBe(enable.mock.calls[0][0].client);
    expect(disable.mock.calls[0][0].state).toEqual({ enabled: 'alerts' });
    expect(docs).toEqual([]);
  });

  it('keeps recovery state in memory through database failure and blocks duplicate enable on restart', async () => {
    const { hooks, subscriptions, target, frogbot, docs } = createHarness();
    const write = frogbot.update.getMockImplementation()!;
    const enable = vi.spyOn(hooks, 'onEnable').mockImplementationOnce(async () => {
      frogbot.update.mockRejectedValue(new Error('database unavailable'));
      return { enabled: 'alerts' };
    });
    const disable = vi.spyOn(hooks, 'onDisable').mockRejectedValueOnce(new Error('vendor offline'));
    await expect(subscriptions.enable(target)).rejects.toThrow('database unavailable');
    expect(docs[0]).toMatchObject({ enablePending: true, state: null });
    frogbot.update.mockImplementation(write);
    await expect(new TriggerSubscriptions(frogbot as never).enable(target)).rejects.toThrow(
      /unresolved/i,
    );
    await subscriptions.disable(42);
    expect(enable).toHaveBeenCalledTimes(1);
    expect(disable).toHaveBeenCalledTimes(2);
    expect(disable).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: { enabled: 'alerts' } }),
    );
    expect(docs).toEqual([]);
  });

  it('compensates an ambiguous final write that committed before reporting failure', async () => {
    const { hooks, subscriptions, target, frogbot, docs } = createHarness();
    const write = frogbot.update.getMockImplementation()!;
    vi.spyOn(hooks, 'onEnable').mockImplementationOnce(async () => {
      frogbot.update.mockImplementationOnce(async (args) => {
        await write(args);
        throw new Error('response lost');
      });
      return { enabled: 'alerts' };
    });
    const disable = vi.spyOn(hooks, 'onDisable');
    await expect(subscriptions.enable(target)).rejects.toThrow('response lost');
    expect(disable).toHaveBeenCalledTimes(1);
    expect(docs[0]).toMatchObject({ status: 'error', cleanupPending: false, state: null });
  });

  it('still compensates while the original lease is held if the database cannot be read or written', async () => {
    const { hooks, subscriptions, target, frogbot, docs } = createHarness();
    const read = frogbot.find.getMockImplementation()!;
    const write = frogbot.update.getMockImplementation()!;
    vi.spyOn(hooks, 'onEnable').mockImplementationOnce(async () => {
      frogbot.find.mockRejectedValue(new Error('database unavailable'));
      frogbot.update.mockRejectedValue(new Error('database unavailable'));
      return { enabled: 'alerts' };
    });
    const disable = vi.spyOn(hooks, 'onDisable');
    await expect(subscriptions.enable(target)).rejects.toThrow('database unavailable');
    expect(disable).toHaveBeenCalledTimes(1);
    frogbot.find.mockImplementation(read);
    frogbot.update.mockImplementation(write);
    await subscriptions.disable(42);
    expect(disable).toHaveBeenCalledTimes(1);
    expect(docs).toEqual([]);
  });
});
