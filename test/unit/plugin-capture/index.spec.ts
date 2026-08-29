import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  captureBlobKey,
  decodeCapture,
  encodeCapture,
} from '../../../packages/plugins/plugin-capture/src/blob.js';
import { createCapturesCollection } from '../../../packages/plugins/plugin-capture/src/collection.js';
import { createCaptureHooks } from '../../../packages/plugins/plugin-capture/src/hooks.js';
import {
  captureConfigKey,
  capturePlugin,
  filesystemCaptureStorage,
} from '../../../packages/plugins/plugin-capture/src/index.js';
import type {
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
      put: vi.fn(async (key, bytes) => void blobs.set(key, bytes)),
      get: vi.fn(async (key) => blobs.get(key)!),
      delete: vi.fn(async () => undefined),
      async *list() {},
    };
    const create = vi.fn(async () => ({}));
    const logger = { error: vi.fn() };
    const req = {
      user: { id: 'user-1', apiKeyId: 'key-1', capture: true },
      frogbot: {
        create,
        logger,
      },
    };
    const hooks = createCaptureHooks({
      enabled: true,
      sampleRate: 1,
      maxBodyBytes: 10_000,
      collectionSlug: 'captures',
      storage,
    });
    for (const error of [undefined, new Error('upstream failed')]) {
      const context: Record<string, unknown> = {};
      const base = {
        requestId: `request-${error ? 'error' : 'success'}`,
        operation: 'responses' as const,
        startedAt: Date.now(),
        context,
        otel: {},
        req,
        user: req.user,
      };
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
      if (error) {
        await hooks.afterError?.[0]?.({
          ...base,
          phase: 'afterError',
          failedPhase: 'beforeUpstream',
          model: 'gpt-5',
          provider: 'openai',
          error,
        });
      } else {
        await hooks.afterUpstream?.[0]?.({
          ...base,
          phase: 'afterUpstream',
          model: 'gpt-5',
          provider: 'openai',
          response: { text: 'hi' },
        });
      }
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
    const put = vi.fn(async () => {
      throw new Error('storage down');
    });
    const logger = { error: vi.fn() };
    const req = {
      user: { id: 'user-1', apiKeyId: 'key-1', capture: true },
      frogbot: { create: vi.fn(), logger },
    };
    const hooks = createCaptureHooks({
      enabled: false,
      sampleRate: 1,
      maxBodyBytes: 30,
      collectionSlug: 'captures',
      storage: { put, get: vi.fn(), delete: vi.fn(), async *list() {} } as never,
    });
    const base = {
      requestId: 'request-1',
      operation: 'responses' as const,
      startedAt: Date.now(),
      context: {} as Record<string, unknown>,
      otel: {},
      req,
      user: req.user,
    };
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
    ['response', { response: { text: 'x'.repeat(2_000) } }],
    ['error', { error: new Error('x'.repeat(2_000)), failedPhase: 'upstream' as const }],
  ])('rejects an oversized %s without writing either half', async (_name, completion) => {
    const put = vi.fn();
    const create = vi.fn();
    const logger = { error: vi.fn() };
    const req = {
      user: { id: 'user-1', capture: true },
      frogbot: { create, logger },
    };
    const hooks = createCaptureHooks({
      enabled: false,
      sampleRate: 1,
      maxBodyBytes: 1_000,
      collectionSlug: 'captures',
      storage: { put, get: vi.fn(), delete: vi.fn(), async *list() {} } as never,
    });
    const base = {
      requestId: 'request-large',
      operation: 'responses' as const,
      startedAt: Date.now(),
      context: {} as Record<string, unknown>,
      otel: {},
      req,
      user: req.user,
    };
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
    if ('error' in completion) {
      await hooks.afterError?.[0]?.({
        ...base,
        phase: 'afterError',
        model: 'gpt-5',
        provider: 'openai',
        ...completion,
      });
    } else {
      await hooks.afterUpstream?.[0]?.({
        ...base,
        phase: 'afterUpstream',
        model: 'gpt-5',
        provider: 'openai',
        ...completion,
      });
    }
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledOnce());
    expect(put).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('capture plugin', () => {
  it('appends hooks, registers storage, adds a content-free collection, and softly extends API keys', async () => {
    const existing = vi.fn();
    const existingBeforeUpstream = vi.fn(() => {
      throw new Error('blocked before upstream');
    });
    const plugin = capturePlugin({ storage: {} as CaptureStorage, enabled: true });
    const config = await plugin({
      secret: 'secret',
      db: {} as never,
      collections: [
        {
          slug: 'api-keys',
          fields: [
            { name: 'prefix', type: 'text' },
            { name: 'tokenHash', type: 'text' },
          ],
        },
      ],
      ai: {
        providers: {},
        hooks: { beforeOperation: [existing], beforeUpstream: [existingBeforeUpstream] },
      },
    } as never);
    expect(config.ai?.hooks?.beforeOperation?.[0]).toBe(existing);
    expect(config.ai?.hooks?.beforeOperation).toHaveLength(2);
    expect(config.ai?.hooks?.beforeUpstream?.[1]).toBe(existingBeforeUpstream);
    expect(config.collections.map((collection) => collection.slug)).toContain('ai-captures');
    expect(
      config.collections[0].fields.flatMap((field) => ('name' in field ? [field.name] : [])),
    ).toEqual(expect.arrayContaining(['capture', 'captureSampleRate']));
    expect(config.custom?.[captureConfigKey]).toEqual(
      expect.objectContaining({ collectionSlug: 'ai-captures' }),
    );
  });
});
