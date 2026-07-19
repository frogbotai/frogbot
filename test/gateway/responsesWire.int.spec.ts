// /v1/responses wire-fidelity — mock-tier proofs for behaviors that a live
// free model can neither prove nor disprove (upstream param introspection and
// injected finishReason faults).
//
// Tiers, per the gateway testing policy: live Zen e2e is the gold standard, but
//   - G20 needs to observe what provider options actually reach the model's
//     doGenerate seam (a real model can comply by chance; we can't introspect
//     the forwarded params live).
//   - G22 needs a non-streaming provider that finishes with finishReason
//     'error' on demand (a free model won't reproduce that fault reliably).
// Both are captured here with a MockLanguageModelV4.

import { describe, expect, it } from 'vitest';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
} from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

// A mock model that records the options it was called with, so a test can
// assert exactly which provider options the gateway forwarded to the SDK seam.
function createCapturingModel(capture: (options: LanguageModelV4CallOptions) => void): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    defaultObjectGenerationMode: undefined,
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: (options: LanguageModelV4CallOptions) => {
      capture(options);
      // Return valid JSON text so a json_schema structured-output request
      // parses cleanly — this keeps the request a 200 so the assertion lands
      // on the forwarded provider options, not an incidental parse error.
      return Promise.resolve({
        content: [{ type: 'text', text: '{}' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 1, noCache: 1 },
          outputTokens: { total: 1, text: 1 },
        },
        warnings: [],
        response: { id: 'r', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
      });
    },
    doStream: () => Promise.resolve({ stream: new ReadableStream() }),
  } as LanguageModelV4;
}

// A non-streaming model that finishes with finishReason 'error' — the exact
// finishReason that toResponseStatus maps to status 'failed' (toResponse.ts:57).
// This is the finishReason path, NOT a thrown provider error: doGenerate
// resolves normally with usage + content, it just reports 'error'.
function createErrorFinishModel(): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    defaultObjectGenerationMode: undefined,
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: 'text', text: '' }],
        finishReason: { unified: 'error', raw: 'error' },
        usage: {
          inputTokens: { total: 3, noCache: 3 },
          outputTokens: { total: 0, text: 0 },
        },
        warnings: [],
        response: { id: 'r', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
      }),
    doStream: () => Promise.resolve({ stream: new ReadableStream() }),
  } as LanguageModelV4;
}

function makeApp(providerName: string, model: LanguageModelV4) {
  const fakeProvider = { languageModel: () => model };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry });
}

type ResponsesBody = {
  status?: string;
  error?: { code?: string; message?: string } | null;
};

describe('gateway integration — /v1/responses wire fidelity (mock tier)', () => {
  // G20 — the reasoning / text.verbosity / text.format.strict knobs a client
  // sends on /v1/responses must reach the model as OpenAI provider options
  // (reasoningEffort / reasoningSummary / textVerbosity / strictJsonSchema).
  // Today the request schema has no `reasoning` key and textConfigSchema parses
  // only `format`, and buildOpenAIResponseOptions forwards none of the four, so
  // a client asking for high reasoning effort silently gets default behavior.
  it('forwards reasoning/verbosity/strict as OpenAI provider options to the model', async () => {
    let captured: LanguageModelV4CallOptions | undefined;
    // Provider is 'openai' so the OpenAI provider-option gate is active — this
    // isolates the drop to the reasoning/text params, not the provider gate.
    const app = makeApp('openai', createCapturingModel((options) => { captured = options; }));

    const { status } = await postJson(app, '/v1/responses', {
      model: 'openai/gpt-5',
      input: 'hi',
      reasoning: { effort: 'high', summary: 'auto' },
      text: {
        verbosity: 'low',
        format: { type: 'json_schema', name: 'x', schema: { type: 'object' }, strict: true },
      },
    });

    expect(status).toBe(200);
    const openai = captured?.providerOptions?.openai;
    expect(openai?.reasoningEffort).toBe('high');
    expect(openai?.reasoningSummary).toBe('auto');
    expect(openai?.textVerbosity).toBe('low');
    expect(openai?.strictJsonSchema).toBe(true);
  });

  // G22 — a non-streaming response that finishes with finishReason 'error'
  // reports status 'failed' but ships error:null (toResponse.ts:33 hardcodes
  // it). A failed response must carry a machine-readable error object so a
  // client can tell WHY it failed; the streaming path already emits one via
  // failedError, this is a non-streaming route asymmetry.
  it('non-streaming failed status carries a non-null error object', async () => {
    const app = makeApp('openai', createErrorFinishModel());

    const { status, body } = await postJson<ResponsesBody>(app, '/v1/responses', {
      model: 'openai/gpt-4o-mini',
      input: 'hi',
    });

    expect(status).toBe(200);
    expect(body.status).toBe('failed');
    expect(body.error).not.toBeNull();
    expect(body.error).toEqual(expect.objectContaining({
      code: expect.any(String),
      message: expect.any(String),
    }));
  });
});
