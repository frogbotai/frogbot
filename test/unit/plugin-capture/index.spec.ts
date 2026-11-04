import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { FrogBotConfig, FrogBotRequest, Plugin } from 'frogbot';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildConfig } from '../../../packages/frogbot/src/config/build.js';
import { apiKeysPlugin } from '../../../packages/plugins/plugin-api-keys/src/index.js';
import {
  captureBlobKey,
  decodeCapture,
  encodeCapture,
} from '../../../packages/plugins/plugin-capture/src/blob.js';
import { createCapturesCollection } from '../../../packages/plugins/plugin-capture/src/collection.js';
import { createCaptureHooks } from '../../../packages/plugins/plugin-capture/src/hooks.js';
import {
  capturePlugin,
  filesystemCaptureStorage,
} from '../../../packages/plugins/plugin-capture/src/index.js';
import type {
  CapturePluginOptions,
  CaptureRecord,
  CaptureStorage,
} from '../../../packages/plugins/plugin-capture/src/types.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function capture(): CaptureRecord {
  return {
    captureId: 'capture-1',
    requestId: 'request-1',
    operation: 'responses',
    model: 'gpt-5',
    provider: 'openai',
    requestedAt: '2026-08-20T00:00:00.000Z',
    completedAt: '2026-08-20T00:00:01.000Z',
    request: { messages: [{ role: 'user', content: 'hello' }] },
    response: { text: 'hi' },
  };
}

type CaptureHooks = ReturnType<typeof createCaptureHooks>;

type HookBase = ReturnType<typeof hookBase>;

type Completion =
  { response: unknown } | { error: Error; failedPhase: 'beforeUpstream' | 'upstream' };

function request(fields: {
  user: Record<string, unknown>;
  frogbot: Record<string, unknown>;
}): FrogBotRequest {
  return fields as unknown as FrogBotRequest;
}

function hookBase(requestId: string, req: FrogBotRequest) {
  return {
    requestId,
    operation: 'responses' as const,
    startedAt: Date.now(),
    context: {} as Record<string, unknown>,
    otel: {},
    req,
    user: req.user,
  };
}

async function complete(hooks: CaptureHooks, base: HookBase, completion: Completion) {
  const upstream = { ...base, model: 'gpt-5', provider: 'openai' };

  if ('error' in completion) {
    await hooks.afterError?.[0]?.({ ...upstream, phase: 'afterError', ...completion });
  } else {
    await hooks.afterUpstream?.[0]?.({ ...upstream, phase: 'afterUpstream', ...completion });
  }
}

describe('capture blobs', () => {
  it('round-trips gzip JSON and generates unique keys', async () => {
    expect(await decodeCapture(await encodeCapture(capture()))).toEqual(capture());
    expect(captureBlobKey('a', new Date('2026-08-20'))).toBe('2026-08-20/a.json.gz');
    expect(captureBlobKey('a')).not.toBe(captureBlobKey('b'));
  });

  it('stores, lists, reads, and deletes filesystem blobs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'frogbot-capture-'));
    roots.push(root);
    const storage = filesystemCaptureStorage(root);
    await storage.put('2026-08-20/a.json.gz', new Uint8Array([1, 2, 3]));

    expect([...(await storage.get('2026-08-20/a.json.gz'))]).toEqual([1, 2, 3]);

    const keys: string[] = [];

    for await (const key of storage.list('2026-08-20')) keys.push(key);

    expect(keys).toEqual(['2026-08-20/a.json.gz']);

    await storage.delete(keys[0]);

    await expect(storage.get(keys[0])).rejects.toThrow();
  });
});

describe('capture index', () => {
  it('contains metadata only and is immutable through collection access', () => {
    const collection = createCapturesCollection('captures');
    const names = collection.fields.flatMap((field) => ('name' in field ? [field.name] : []));

    expect(names).toEqual(
      expect.arrayContaining(['captureId', 'requestId', 'blobKey', 'sizeBytes']),
    );
    expect(names).not.toEqual(expect.arrayContaining(['request', 'response', 'error', 'content']));
    expect(collection.access?.create?.({} as never)).toBe(false);
    expect(collection.access?.update?.({} as never)).toBe(false);
    expect(collection.access?.delete?.({} as never)).toBe(false);
  });
});

describe('capture hooks', () => {
  it('captures success and error without storing headers', async () => {
    const blobs = new Map<string, Uint8Array>();
    const storage: CaptureStorage = {
      put: vi.fn((key, bytes) => {
        blobs.set(key, bytes);

        return Promise.resolve();
      }),
      get: vi.fn((key) => Promise.resolve(blobs.get(key)!)),
      delete: vi.fn(() => Promise.resolve()),
      async *list() {},
    };

    const create = vi.fn(() => Promise.resolve({}));
    const logger = { error: vi.fn() };
    const req = request({
      user: {
        id: 'user-1',
        _strategy: 'api-key',
        apiKeyId: 'key-1',
        apiKey: { id: 'key-1', capture: true },
      },
      frogbot: {
        create,
        logger,
      },
    });

    const hooks = createCaptureHooks({
      enabled: true,
      sampleRate: 1,
      maxBodyBytes: 10_000,
      collectionSlug: 'captures',
      storage,
    });

    const completions: [string, Completion][] = [
      ['success', { response: { text: 'hi' } }],
      ['error', { error: new Error('upstream failed'), failedPhase: 'beforeUpstream' }],
    ];

    for (const [outcome, completion] of completions) {
      const base = hookBase(`request-${outcome}`, req);
      await hooks.beforeOperation?.[0]?.({ ...base, phase: 'beforeOperation' });

      await hooks.beforeUpstream?.[0]?.({
        ...base,
        phase: 'beforeUpstream',
        model: 'gpt-5',
        provider: 'openai',
        messages: [{ role: 'user', content: 'hello' }],
        headers: new Headers({ authorization: 'secret' }),
        providerOptions: {},
      });

      await complete(hooks, base, completion);
    }

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    const records = await Promise.all([...blobs.values()].map(decodeCapture));

    expect(records.map((record) => (record.error ? 'error' : 'success')).sort()).toEqual([
      'error',
      'success',
    ]);
    expect(JSON.stringify(records)).not.toContain('authorization');
    expect(JSON.stringify(records)).not.toContain('secret');
  });

  it('is off by default, honors an API-key override, caps bodies, and isolates writes', async () => {
    const put = vi.fn(() => Promise.reject(new Error('storage down')));
    const logger = { error: vi.fn() };
    const req = request({
      user: {
        id: 'user-1',
        _strategy: 'api-key',
        apiKeyId: 'key-1',
        apiKey: { id: 'key-1', capture: true },
      },
      frogbot: { create: vi.fn(), logger },
    });

    const hooks = createCaptureHooks({
      enabled: false,
      sampleRate: 1,
      maxBodyBytes: 30,
      collectionSlug: 'captures',
      storage: { put, get: vi.fn(), delete: vi.fn(), async *list() {} },
    });

    const base = hookBase('request-1', req);
    await hooks.beforeOperation?.[0]?.({ ...base, phase: 'beforeOperation' });

    await hooks.beforeUpstream?.[0]?.({
      ...base,
      phase: 'beforeUpstream',
      model: 'gpt-5',
      provider: 'openai',
      messages: [{ content: 'body larger than configured cap' }],
      headers: new Headers(),
      providerOptions: {},
    });

    await hooks.afterUpstream?.[0]?.({
      ...base,
      phase: 'afterUpstream',
      model: 'gpt-5',
      provider: 'openai',
      response: {},
    });

    expect(put).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it.each([
    ['reads sampling from the API key, not its owner', 'api-key', false],
    ['reads sampling from a session user', 'local-jwt', true],
  ])('%s', async (_name, strategy, captured) => {
    const req = request({
      user: {
        id: 'user-1',
        _strategy: strategy,
        captureSampleRate: 1,
        apiKey: { id: 'key-1', capture: 'enabled', captureSampleRate: 0 },
      },
      frogbot: { create: vi.fn(), logger: { error: vi.fn() } },
    });

    const hooks = createCaptureHooks({
      enabled: true,
      sampleRate: 1,
      maxBodyBytes: 10_000,
      collectionSlug: 'captures',
      storage: { put: vi.fn(), get: vi.fn(), delete: vi.fn(), async *list() {} },
    });

    const base = hookBase('request-1', req);
    await hooks.beforeOperation?.[0]?.({ ...base, phase: 'beforeOperation' });

    expect(base.context.frogbotCapture).toEqual({ enabled: captured });
  });

  it.each([
    ['stores a numeric API key id as text', 'api-key', '3'],
    ['stores no API key for a session login carrying apiKeyId', 'local-jwt', undefined],
  ])('%s', async (_name, strategy, apiKey) => {
    const blobs = new Map<string, Uint8Array>();
    const storage: CaptureStorage = {
      put: vi.fn((key, bytes) => {
        blobs.set(key, bytes);

        return Promise.resolve();
      }),
      get: vi.fn((key) => Promise.resolve(blobs.get(key)!)),
      delete: vi.fn(() => Promise.resolve()),
      async *list() {},
    };

    const create = vi.fn((_args: { data: Record<string, unknown> }) => Promise.resolve({}));
    const req = request({
      user: { id: 'user-1', _strategy: strategy, apiKeyId: 3, capture: true },
      frogbot: { create, logger: { error: vi.fn() } },
    });

    const hooks = createCaptureHooks({
      enabled: true,
      sampleRate: 1,
      maxBodyBytes: 10_000,
      collectionSlug: 'captures',
      storage,
    });

    const base = hookBase('request-key', req);

    await hooks.beforeOperation?.[0]?.({ ...base, phase: 'beforeOperation' });

    await hooks.beforeUpstream?.[0]?.({
      ...base,
      phase: 'beforeUpstream',
      model: 'gpt-5',
      provider: 'openai',
      messages: [{ role: 'user', content: 'hello' }],
      headers: new Headers(),
      providerOptions: {},
    });

    await hooks.afterUpstream?.[0]?.({
      ...base,
      phase: 'afterUpstream',
      model: 'gpt-5',
      provider: 'openai',
      response: { text: 'hi' },
    });

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());

    const [record] = await Promise.all([...blobs.values()].map(decodeCapture));

    expect(create.mock.calls[0]?.[0].data.apiKey).toBe(apiKey);
    expect(record?.apiKey).toBe(apiKey);
  });

  it.each<[string, Completion]>([
    ['response', { response: { text: 'x'.repeat(2_000) } }],
    ['error', { error: new Error('x'.repeat(2_000)), failedPhase: 'upstream' }],
  ])('rejects an oversized %s without writing either half', async (_name, completion) => {
    const put = vi.fn();
    const create = vi.fn();
    const logger = { error: vi.fn() };
    const req = request({
      user: { id: 'user-1', capture: true },
      frogbot: { create, logger },
    });

    const hooks = createCaptureHooks({
      enabled: false,
      sampleRate: 1,
      maxBodyBytes: 1_000,
      collectionSlug: 'captures',
      storage: { put, get: vi.fn(), delete: vi.fn(), async *list() {} },
    });

    const base = hookBase('request-large', req);
    await hooks.beforeOperation?.[0]?.({ ...base, phase: 'beforeOperation' });

    await hooks.beforeUpstream?.[0]?.({
      ...base,
      phase: 'beforeUpstream',
      model: 'gpt-5',
      provider: 'openai',
      messages: [{ content: 'small' }],
      headers: new Headers(),
      providerOptions: {},
    });

    await complete(hooks, base, completion);
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledOnce());

    expect(put).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('capture plugin', () => {
  it('appends hooks, adds its commands, and adds a content-free collection', async () => {
    const existing = vi.fn();
    const existingBeforeUpstream = vi.fn(() => {
      throw new Error('blocked before upstream');
    });

    const hello = vi.fn();

    const plugin = capturePlugin({ storage: {} as CaptureStorage, enabled: true });
    const config = await plugin({
      secret: 'secret',
      db: {} as never,
      cli: { commands: { hello } },
      collections: [],
      ai: {
        providers: {},
        hooks: { beforeOperation: [existing], beforeUpstream: [existingBeforeUpstream] },
      },
    });

    expect(config.ai?.hooks?.beforeOperation?.[0]).toBe(existing);
    expect(config.ai?.hooks?.beforeOperation).toHaveLength(2);
    expect(config.ai?.hooks?.beforeUpstream?.[1]).toBe(existingBeforeUpstream);
    expect(config.collections.map((collection) => collection.slug)).toEqual(['ai-captures']);
    expect(config.cli?.commands?.hello).toBe(hello);
    expect(Object.keys(config.cli?.commands ?? {})).toEqual([
      'hello',
      'export:captures',
      'export:training-data',
    ]);
    expect(config.custom?.frogbotCapture).toBeUndefined();
  });

  it.each([
    ['before', (keys: Plugin, capture: Plugin) => [capture, keys]],
    ['after', (keys: Plugin, capture: Plugin) => [keys, capture]],
  ])('adds capture fields to API keys when listed %s the API keys plugin', async (_name, list) => {
    const built = await buildConfig({
      secret: 'secret',
      db: {} as never,
      collections: [{ slug: 'users', auth: true, fields: [] }],
      ai: { providers: { openai: { apiKey: 'test' } } },
      plugins: list(
        apiKeysPlugin({ collectionSlug: 'credentials' }),
        capturePlugin({ storage: {} as CaptureStorage }),
      ),
    });

    const { collections } = await built._internal.payloadConfig;

    const fields = (slug: string) =>
      collections
        .find((collection) => collection.slug === slug)
        ?.fields.flatMap((field) => ('name' in field ? [field.name] : []));

    expect(fields('credentials')).toEqual(expect.arrayContaining(['capture', 'captureSampleRate']));
    expect(fields('users')).not.toContain('capture');
  });
});

describe('capture retention', () => {
  type Task = NonNullable<NonNullable<FrogBotConfig['jobs']>['tasks']>[number];
  type Row = { id: number; blobKey: string; requestedAt: string };

  async function pruneTask(
    retention: CapturePluginOptions['retention'],
    storage: CaptureStorage = {} as CaptureStorage,
  ): Promise<Task | undefined> {
    const config = await capturePlugin({ storage, retention })({
      secret: 'secret',
      db: {} as never,
      collections: [],
      ai: { providers: {} },
    });

    return config.jobs?.tasks?.at(-1);
  }

  async function run(task: Task | undefined, req: object): Promise<void> {
    const handler = task?.handler;

    if (typeof handler !== 'function') throw new Error('Expected an inline task handler.');

    await handler({ req } as unknown as Parameters<typeof handler>[0]);
  }

  function memoryStorage(keys: string[]): CaptureStorage & { keys: Set<string> } {
    const stored = new Set(keys);

    return {
      keys: stored,
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn((key: string) => {
        stored.delete(key);

        return Promise.resolve();
      }),
      async *list() {},
    };
  }

  function memoryPayload(rows: Row[]) {
    return {
      find: vi.fn((args: { where: { requestedAt: { less_than: string } }; limit: number }) =>
        Promise.resolve({
          docs: rows
            .filter((row) => row.requestedAt < args.where.requestedAt.less_than)
            .slice(0, args.limit),
        }),
      ),
      delete: vi.fn((args: { id: number }) => {
        rows.splice(
          rows.findIndex((row) => row.id === args.id),
          1,
        );

        return Promise.resolve({});
      }),
    };
  }

  it('registers no task by default', async () => {
    expect(await pruneTask(undefined)).toBeUndefined();
    expect(await pruneTask(false)).toBeUndefined();
  });

  it('schedules on the default queue at midnight', async () => {
    const task = await pruneTask({ days: 30 });

    expect(task?.slug).toBe('frogbot-prune-ai-captures');
    expect(task?.schedule).toEqual([{ cron: '0 0 * * *', queue: 'default' }]);
  });

  it('keeps a custom cron', async () => {
    expect((await pruneTask({ days: 30, cron: '0 3 * * *' }))?.schedule).toEqual([
      { cron: '0 3 * * *', queue: 'default' },
    ]);
  });

  it.each([0, 1.5])('rejects retention.days of %s', (days) => {
    expect(() => capturePlugin({ retention: { days } })).toThrow(
      '[plugin-capture] retention.days must be a positive integer.',
    );
  });

  it('deletes expired blobs and rows and keeps recent ones', async () => {
    const recent = new Date().toISOString();
    const rows: Row[] = [
      { id: 1, blobKey: 'old/a', requestedAt: '2000-01-01T00:00:00.000Z' },
      { id: 2, blobKey: 'old/b', requestedAt: '2000-01-02T00:00:00.000Z' },
      { id: 3, blobKey: 'new/c', requestedAt: recent },
    ];

    const storage = memoryStorage(rows.map((row) => row.blobKey));
    const payload = memoryPayload(rows);

    await run(await pruneTask({ days: 30 }, storage), { frogbot: payload });

    expect(rows.map((row) => row.id)).toEqual([3]);
    expect([...storage.keys]).toEqual(['new/c']);
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'ai-captures',
        limit: 100,
        sort: 'requestedAt',
        depth: 0,
        overrideAccess: true,
      }),
    );
  });

  it('fails the run when a blob delete throws', async () => {
    const rows: Row[] = [{ id: 1, blobKey: 'old/a', requestedAt: '2000-01-01T00:00:00.000Z' }];
    const storage = memoryStorage(['old/a']);
    vi.mocked(storage.delete).mockRejectedValueOnce(new Error('storage down'));
    const payload = memoryPayload(rows);

    await expect(run(await pruneTask({ days: 30 }, storage), { frogbot: payload })).rejects.toThrow(
      'storage down',
    );
    expect(payload.delete).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
  });

  it('finishes on retry after a row delete fails once its blob is gone', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'frogbot-capture-'));
    roots.push(root);
    const storage = filesystemCaptureStorage(root);
    const rows: Row[] = [
      { id: 1, blobKey: 'old/a.json.gz', requestedAt: '2000-01-01T00:00:00.000Z' },
      { id: 2, blobKey: 'old/b.json.gz', requestedAt: '2000-01-02T00:00:00.000Z' },
    ];

    for (const row of rows) await storage.put(row.blobKey, new Uint8Array([1]));

    const payload = memoryPayload(rows);
    vi.mocked(payload.delete).mockRejectedValueOnce(new Error('database down'));
    const task = await pruneTask({ days: 30 }, storage);

    await expect(run(task, { frogbot: payload })).rejects.toThrow('database down');
    expect(rows.map((row) => row.id)).toEqual([1, 2]);
    await expect(storage.get('old/a.json.gz')).rejects.toThrow();

    await run(task, { frogbot: payload });

    expect(rows).toEqual([]);
    await expect(storage.get('old/b.json.gz')).rejects.toThrow();
  });

  it('keeps finding batches until no expired row is left', async () => {
    const rows: Row[] = Array.from({ length: 101 }, (_, index) => ({
      id: index,
      blobKey: `old/${index}`,
      requestedAt: '2000-01-01T00:00:00.000Z',
    }));

    const storage = memoryStorage(rows.map((row) => row.blobKey));
    const payload = memoryPayload(rows);

    await run(await pruneTask({ days: 30 }, storage), { frogbot: payload });

    expect(rows).toEqual([]);
    expect(storage.keys.size).toBe(0);
    expect(payload.find).toHaveBeenCalledTimes(3);
  });

  it('follows a custom collectionSlug', async () => {
    const config = await capturePlugin({
      storage: {} as CaptureStorage,
      collectionSlug: 'captures',
      retention: { days: 30 },
    })({ secret: 'secret', db: {} as never, collections: [], ai: { providers: {} } });

    expect(config.jobs?.tasks?.at(-1)?.slug).toBe('frogbot-prune-captures');
  });

  it('no longer accepts retentionDays', () => {
    // @ts-expect-error retentionDays was replaced by retention.
    const options: CapturePluginOptions = { retentionDays: 30 };

    expect(options).toEqual({ retentionDays: 30 });
  });
});
