import type { LanguageModelV4, LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { finish, mockUsage } from './mockModel.js';

function createCapturingModel(
  capture: (options: LanguageModelV4CallOptions) => void,
): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: (options: LanguageModelV4CallOptions) => {
      capture(options);

      return Promise.resolve({
        content: [{ type: 'text', text: '{}' }],
        finishReason: finish('stop', 'stop'),
        usage: mockUsage({
          inputTokens: { total: 1, noCache: 1 },
          outputTokens: { total: 1, text: 1 },
        }),
        warnings: [],
        response: { id: 'r', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
      });
    },
    doStream: () => Promise.resolve({ stream: new ReadableStream() }),
  };
}

function createErrorFinishModel(): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: 'text', text: '' }],
        finishReason: finish('error', 'error'),
        usage: mockUsage({
          inputTokens: { total: 3, noCache: 3 },
          outputTokens: { total: 0, text: 0 },
        }),
        warnings: [],
        response: { id: 'r', modelId: 'mock-model', timestamp: new Date('2026-01-01T00:00:00Z') },
      }),
    doStream: () => Promise.resolve({ stream: new ReadableStream() }),
  };
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
  it('forwards reasoning/verbosity/strict as OpenAI provider options to the model', async () => {
    let captured: LanguageModelV4CallOptions | undefined;
    const app = makeApp(
      'openai',
      createCapturingModel((options) => {
        captured = options;
      }),
    );

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

  it('non-streaming failed status carries a non-null error object', async () => {
    const app = makeApp('openai', createErrorFinishModel());

    const { status, body } = await postJson<ResponsesBody>(app, '/v1/responses', {
      model: 'openai/gpt-4o-mini',
      input: 'hi',
    });

    expect(status).toBe(200);
    expect(body.status).toBe('failed');
    expect(body.error).not.toBeNull();
    expect(body.error).toEqual(
      expect.objectContaining({
        code: expect.any(String),
        message: expect.any(String),
      }),
    );
  });
});
