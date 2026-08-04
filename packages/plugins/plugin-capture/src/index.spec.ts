import { mkdtemp, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';

import type { FrogbotConfig } from 'frogbot';
import { describe, expect, it, vi } from 'vitest';

import { capturePlugin, type CaptureBlob, type CaptureStorage, createCaptureFilesystemStorage } from './index.js';

const unzip = promisify(gunzip);

function config(): FrogbotConfig {
  return {
    secret: 'test',
    db: {} as never,
    collections: [],
    ai: { providers: { openai: { apiKey: 'test' } } },
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('capturePlugin', () => {
  it('injects capture policy fields into the configured API-key collection', async () => {
    const input = config();
    input.collections.push({ slug: 'credentials', fields: [{ name: 'name', type: 'text' }] });
    const result = await capturePlugin({ apiKeysCollectionSlug: 'credentials' })(input);
    const fields = result.collections[0]!.fields;

    expect(fields).toContainEqual(expect.objectContaining({
      name: 'capture',
      type: 'select',
      defaultValue: 'off',
      required: true,
    }));
    expect(fields).toContainEqual(expect.objectContaining({
      name: 'captureSampleRate',
      type: 'number',
      min: 0,
      max: 1,
    }));
    expect(fields).toContainEqual({ name: 'name', type: 'text' });
  });

  it('requires explicitly configured API-key collections to exist', () => {
    expect(() => capturePlugin({ apiKeysCollectionSlug: 'credentials' })(config())).toThrow(
      "API keys collection 'credentials' was not found",
    );
  });

  it('appends hooks and defaults capture to off', async () => {
    const existing = vi.fn();
    const put = vi.fn();
    const input = config();
    input.ai!.hooks = { beforeUpstream: [existing] };
    const result = await capturePlugin({ storage: { put } })(input);
    const context: Record<string, unknown> = {};

    await result.ai!.hooks!.beforeOperation!.at(-1)!({ context } as never);
    await result.ai!.hooks!.beforeUpstream!.at(-1)!({
      context,
      operation: 'responses',
      messages: [{ role: 'user', content: 'hello' }],
    } as never);
    await result.ai!.hooks!.afterUpstream!.at(-1)!({ context, requestId: 'req-1' } as never);
    await settle();

    expect(result.ai!.hooks!.beforeUpstream![0]).toBe(existing);
    expect(put).not.toHaveBeenCalled();
  });

  it('writes a gzip blob with the canonical request and assembled response', async () => {
    const writes: Array<{ key: string; bytes: Uint8Array }> = [];
    const result = await capturePlugin({
      defaultPolicy: 'full',
      storage: { put: async (key, bytes) => { writes.push({ key, bytes }); } },
    })(config());
    const context: Record<string, unknown> = {};

    await result.ai!.hooks!.beforeOperation!.at(-1)!({ context } as never);
    await result.ai!.hooks!.beforeUpstream!.at(-1)!({
      context,
      operation: 'responses',
      model: 'gpt-5',
      provider: 'openai',
      messages: [{ role: 'user', content: 'hello' }],
      system: 'system',
      tools: { lookup: { description: 'Lookup' } },
      params: { temperature: 0.2 },
    } as never);
    await result.ai!.hooks!.afterUpstream!.at(-1)!({
      context,
      requestId: 'req-2',
      operation: 'responses',
      model: 'gpt-5',
      provider: 'openai',
      response: { messages: [{ role: 'assistant', content: 'hi' }] },
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    } as never);
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.key).toBe('req-2.json.gz');
    const blob = JSON.parse((await unzip(writes[0]!.bytes)).toString()) as CaptureBlob;
    expect(blob).toMatchObject({
      requestId: 'req-2',
      operation: 'responses',
      model: 'gpt-5',
      provider: 'openai',
      system: 'system',
      params: { temperature: 0.2 },
      messages: [{ role: 'user', content: 'hello' }],
      response: { messages: [{ role: 'assistant', content: 'hi' }] },
      finishReason: 'stop',
    });
    expect(blob.capturedAt).toEqual(expect.any(String));
  });

  it('captures errors only for errors-only policy and skips modality routes', async () => {
    const put = vi.fn<CaptureStorage['put']>().mockResolvedValue(undefined);
    const result = await capturePlugin({ defaultPolicy: 'errors-only', storage: { put } })(config());
    const context: Record<string, unknown> = {};
    const before = result.ai!.hooks!.beforeUpstream!.at(-1)!;

    await result.ai!.hooks!.beforeOperation!.at(-1)!({ context } as never);
    await before({ context, operation: 'embeddings' } as never);
    await result.ai!.hooks!.afterError!.at(-1)!({
      context,
      phase: 'afterError',
      requestId: 'req-3',
      operation: 'embeddings',
      error: new Error('nope'),
    } as never);
    await settle();
    expect(put).not.toHaveBeenCalled();

    await before({ context, operation: 'messages', messages: [{ role: 'user', content: 'x' }] } as never);
    await result.ai!.hooks!.afterUpstream!.at(-1)!({ context, requestId: 'req-4' } as never);
    await settle();
    expect(put).not.toHaveBeenCalled();

    await result.ai!.hooks!.afterError!.at(-1)!({
      context,
      phase: 'afterError',
      requestId: 'req-5',
      operation: 'messages',
      model: 'model',
      provider: 'provider',
      error: new Error('failed'),
    } as never);
    await vi.waitFor(() => expect(put).toHaveBeenCalledOnce());
    const blob = JSON.parse((await unzip(put.mock.calls[0]![1])).toString()) as CaptureBlob;
    expect(blob.error).toMatchObject({ name: 'Error', message: 'failed' });
  });

  it('samples once per request and honors the context opt-out', async () => {
    const put = vi.fn<CaptureStorage['put']>().mockResolvedValue(undefined);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const result = await capturePlugin({ defaultPolicy: 'sample', sampleRate: 0.5, storage: { put } })(config());
    const context: Record<string, unknown> = {};

    await result.ai!.hooks!.beforeOperation!.at(-1)!({ context } as never);
    await result.ai!.hooks!.beforeUpstream!.at(-1)!({ context, operation: 'chat.completions', messages: [] } as never);
    await result.ai!.hooks!.afterUpstream!.at(-1)!({ context, requestId: 'req-6' } as never);
    await vi.waitFor(() => expect(put).toHaveBeenCalledOnce());
    expect(random).toHaveBeenCalledOnce();

    const disabled = { capture: false };
    await result.ai!.hooks!.beforeOperation!.at(-1)!({ context: disabled } as never);
    await result.ai!.hooks!.beforeUpstream!.at(-1)!({ context: disabled, operation: 'responses', messages: [] } as never);
    await result.ai!.hooks!.afterUpstream!.at(-1)!({ context: disabled, requestId: 'req-7' } as never);
    await settle();
    expect(put).toHaveBeenCalledOnce();
    random.mockRestore();
  });

  it('resolves per-key policy before the global default', async () => {
    const put = vi.fn<CaptureStorage['put']>().mockResolvedValue(undefined);
    const findByID = vi.fn().mockResolvedValue({ capture: 'full' });
    const input = config();
    input.collections.push({ slug: 'credentials', fields: [] });
    const result = await capturePlugin({
      apiKeysCollectionSlug: 'credentials',
      defaultPolicy: 'off',
      storage: { put },
    })(input);
    const context: Record<string, unknown> = {};
    const req = { user: { apiKeyId: 'key-1' }, frogbot: { findByID } };

    await result.ai!.hooks!.beforeOperation!.at(-1)!({ context, req } as never);
    await result.ai!.hooks!.beforeUpstream!.at(-1)!({ context, operation: 'responses', messages: [] } as never);
    result.ai!.hooks!.afterUpstream!.at(-1)!({
      context,
      phase: 'afterUpstream',
      requestId: 'req-key',
      operation: 'responses',
      model: 'model',
      provider: 'provider',
    } as never);

    await vi.waitFor(() => expect(put).toHaveBeenCalledOnce());
    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'credentials',
      id: 'key-1',
      overrideAccess: true,
    }));
  });

  it('does not load API-key policy when context capture is disabled', async () => {
    const findByID = vi.fn();
    const input = config();
    input.collections.push({ slug: 'api-keys', fields: [] });
    const result = await capturePlugin({ defaultPolicy: 'full' })(input);

    await result.ai!.hooks!.beforeOperation!.at(-1)!({
      context: { capture: false },
      req: { user: { apiKeyId: 'key-1' }, frogbot: { findByID } },
    } as never);

    expect(findByID).not.toHaveBeenCalled();
  });

  it('does not fail requests when policy lookup or snapshot preparation fails', async () => {
    const logger = { error: vi.fn() };
    const input = config();
    input.collections.push({ slug: 'api-keys', fields: [] });
    const result = await capturePlugin({ defaultPolicy: 'full' })(input);
    const lookupContext: Record<string, unknown> = {};

    await expect(result.ai!.hooks!.beforeOperation!.at(-1)!({
      context: lookupContext,
      req: {
        user: { apiKeyId: 'key-1' },
        frogbot: { findByID: vi.fn().mockRejectedValue(new Error('database unavailable')), logger },
      },
    } as never)).resolves.toBeUndefined();

    const snapshotContext: Record<string, unknown> = {};
    await result.ai!.hooks!.beforeOperation!.at(-1)!({ context: snapshotContext } as never);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => result.ai!.hooks!.beforeUpstream!.at(-1)!({
      context: snapshotContext,
      operation: 'responses',
      messages: [circular],
      req: { frogbot: { logger } },
    } as never)).not.toThrow();
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it('schedules retention cleanup without replacing existing jobs', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const input = config();
    input.jobs = {
      tasks: [{ slug: 'existing', handler: vi.fn() }],
      autoRun: [{ queue: 'existing' }],
    };
    const result = await capturePlugin({
      retentionDays: 7,
      retentionCron: '0 2 * * *',
      storage: { put: vi.fn(), cleanup },
    })(input);
    const task = result.jobs!.tasks!.find((item) => item.slug === 'frogbot-cleanup-captures')!;

    expect(result.jobs!.tasks!.map((item) => item.slug)).toEqual(['existing', 'frogbot-cleanup-captures']);
    expect(task.schedule).toEqual([{ cron: '0 2 * * *', queue: 'frogbot-capture-retention' }]);
    expect(result.jobs!.autoRun).toEqual([{ queue: 'existing' }, { allQueues: true, cron: '* * * * *' }]);
    await (task.handler as (args: Record<string, never>) => Promise<unknown>)({});
    expect(cleanup).toHaveBeenCalledOnce();
    expect(Date.now() - cleanup.mock.calls[0]![0].getTime()).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });

  it('requires cleanup support for finite custom retention', () => {
    expect(() => capturePlugin({ retentionDays: 7, storage: { put: vi.fn() } })).toThrow(
      'Custom storage requires cleanup',
    );
  });

  it('removes only expired gzip captures from filesystem storage', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'frogbot-capture-'));
    const storage = createCaptureFilesystemStorage(directory);
    await storage.put('old.json.gz', new Uint8Array([1]));
    await storage.put('new.json.gz', new Uint8Array([2]));
    await storage.put('other.txt', new Uint8Array([3]));
    const old = new Date('2020-01-01T00:00:00.000Z');
    await utimes(join(directory, 'old.json.gz'), old, old);

    await storage.cleanup!(new Date('2021-01-01T00:00:00.000Z'));

    await expect(stat(join(directory, 'old.json.gz'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(join(directory, 'new.json.gz'))).resolves.toBeDefined();
    await expect(stat(join(directory, 'other.txt'))).resolves.toBeDefined();
  });

  it('logs storage failures without rejecting the hook', async () => {
    const error = new Error('storage unavailable');
    const logger = { error: vi.fn() };
    const result = await capturePlugin({
      defaultPolicy: 'full',
      storage: { put: vi.fn().mockRejectedValue(error) },
    })(config());
    const context: Record<string, unknown> = {};

    await result.ai!.hooks!.beforeOperation!.at(-1)!({ context } as never);
    await result.ai!.hooks!.beforeUpstream!.at(-1)!({ context, operation: 'responses', messages: [] } as never);
    expect(result.ai!.hooks!.afterUpstream!.at(-1)!({
      context,
      requestId: 'req-8',
      req: { frogbot: { logger } },
    } as never)).toBeUndefined();
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith(
      { err: error, requestId: 'req-8' },
      '[plugin-capture] Capture write failed',
    ));
  });
});
