// G39 / PR3 — the chat schema has no `reasoning_effort` field, so a client that
// sends it gets it DROPPED before any provider middleware runs. The vendor
// reasoning-translation middleware chain therefore has no producer to feed it.
//
// This is a mock int test (not a live Zen e2e): reasoning-param FORWARDING is a
// providerOptions-introspection concern — we must capture what reached the model,
// which a free OpenAI-compatible model cannot report back over the wire.

import { describe, expect, it } from 'vitest';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
} from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

function createRecordingModel(onCall: (options: LanguageModelV4CallOptions) => void): LanguageModelV4 {
  const usage = {
    inputTokens: { total: 5, noCache: 5 },
    outputTokens: { total: 4, text: 4 },
  };
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: (options: LanguageModelV4CallOptions) => {
      onCall(options);
      return Promise.resolve({
        content: [{ type: 'text' as const, text: 'ok' }],
        finishReason: 'stop' as const,
        usage,
        warnings: [],
        response: { id: 'r', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
      });
    },
    doStream: (options: LanguageModelV4CallOptions) => {
      onCall(options);
      return Promise.resolve({ stream: new ReadableStream() });
    },
  } as LanguageModelV4;
}

function makeApp(providerName: string, onCall: (o: LanguageModelV4CallOptions) => void) {
  const fakeProvider = { languageModel: () => createRecordingModel(onCall) };
  const registry = { [providerName]: fakeProvider } as ProviderRegistry;
  return createApp({ registry });
}

describe('chat reasoning_effort reaches the model — G39/PR3', () => {
  // A client POSTs reasoning_effort:'high' to an o-series model. The correct
  // behavior is that it arrives as providerOptions.openai.reasoningEffort==='high'
  // (the key the shipped SDK reads). Today the chat schema has no
  // reasoning_effort field, so it's stripped at parse time and never reaches
  // the model — the whole vendor reasoning-translation chain has no producer.
  it('forwards reasoning_effort:high as providerOptions.openai.reasoningEffort', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeApp('openai', (o) => { callOptions = o; });

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/o3',
      messages: [{ role: 'user', content: 'think hard' }],
      reasoning_effort: 'high',
    });

    expect(status).toBe(200);
    const openai = (callOptions?.providerOptions as Record<string, Record<string, unknown>> | undefined)?.['openai'];
    expect(openai?.['reasoningEffort']).toBe('high');
  });
});
