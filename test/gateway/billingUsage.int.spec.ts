// Gateway billing-usage red test — proving review finding G96 at the public
// hook seam (the payload a billing hook actually receives).
//
//   G96 — cache-WRITE tokens (Anthropic `cache_creation_input_tokens`, the
//         priciest token class at 1.25×/2× on Anthropic) are invisible to
//         billing hooks. `HookUsage` carries only `cachedInputTokens` (from
//         `inputTokenDetails.cacheReadTokens`); the AI SDK v7 also exposes
//         `inputTokenDetails.cacheWriteTokens`, but the gateway never maps it,
//         so cache-writes get silently lumped into the uncached input total.
//
// Marked `it.fails(...)` because it asserts the CORRECT behavior — a
// `cacheWriteTokens` field on the hook usage — which does not exist yet.

import { describe, expect, it } from 'vitest';
import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import type { AfterOperationHookArgs, Hooks, HookUsage } from '../../packages/gateway/src/hooks.js';

// AI SDK v7 usage partition: `inputTokens.total` includes cache-read AND
// cache-write; `cacheWrite` maps to `LanguageModelUsage.inputTokenDetails.cacheWriteTokens`.
const USAGE = {
  inputTokens: { total: 100, noCache: 70, cacheRead: 10, cacheWrite: 20 },
  outputTokens: { total: 50, text: 50 },
};

function createUsageMock(): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: () => Promise.resolve({
      content: [{ type: 'text', text: 'hi' }],
      finishReason: 'stop',
      usage: USAGE,
      warnings: [],
      response: { id: 'mock-resp-1', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
    }),
    doStream: () => Promise.resolve({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'text-start', id: 't0' } as LanguageModelV4StreamPart);
          controller.enqueue({ type: 'text-delta', id: 't0', delta: 'hi' } as LanguageModelV4StreamPart);
          controller.enqueue({ type: 'text-end', id: 't0' } as LanguageModelV4StreamPart);
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: USAGE,
          } as LanguageModelV4StreamPart);
          controller.close();
        },
      }),
    }),
  };
}

function makeApp(providerName: string, hooks: Hooks) {
  const registry = { [providerName]: { languageModel: () => createUsageMock() } } as unknown as ProviderRegistry;
  return createApp({ registry, hooks });
}

// A billing hook reads `cacheWriteTokens` off the usage payload. `HookUsage`
// has no such field today, so the read is `undefined` (and the property does
// not even exist on the type). `.cacheWriteTokens` is accessed via an index to
// keep the test compiling against the current (missing-field) type.
const readCacheWrite = (usage: HookUsage | undefined): number | undefined =>
  (usage as unknown as { cacheWriteTokens?: number } | undefined)?.cacheWriteTokens;

describe('gateway billing usage — cache-write token attribution (G96)', () => {
  // G96 (non-streaming): a billing hook must see cache-write tokens (20) as a
  // distinct field; today HookUsage only exposes cachedInputTokens (cache-read).
  it('chat non-streaming: exposes cacheWriteTokens to afterOperation hooks', async () => {
    const calls: AfterOperationHookArgs[] = [];
    const app = makeApp('openai', { afterOperation: [(args) => { calls.push(args); }] });

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    // Cache-read is already exposed; cache-write must be too.
    expect(calls[0].usage?.cachedInputTokens).toBe(10);
    expect(readCacheWrite(calls[0].usage)).toBe(20);
  });

  // G96 (streaming): the same cache-write field must reach afterOperation once
  // the stream drains; the streaming lifecycle's toHookUsage drops it today.
  it('chat streaming: exposes cacheWriteTokens to afterOperation hooks', async () => {
    const calls: AfterOperationHookArgs[] = [];
    const app = makeApp('openai', { afterOperation: [(args) => { calls.push(args); }] });

    const res = await app.request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
    });
    await res.text();

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].usage?.cachedInputTokens).toBe(10);
    expect(readCacheWrite(calls[0].usage)).toBe(20);
  });
});
