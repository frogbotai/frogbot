import type { LanguageModelV4, LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { finish, mockUsage } from './mockModel.js';

function createRecordingModel(opts?: {
  onCall?: (options: LanguageModelV4CallOptions) => void;
}): LanguageModelV4 {
  const usage = mockUsage({
    inputTokens: { total: 5, noCache: 5 },
    outputTokens: { total: 4, text: 4 },
  });

  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: (options: LanguageModelV4CallOptions) => {
      opts?.onCall?.(options);

      return Promise.resolve({
        content: [{ type: 'text' as const, text: 'hi' }],
        finishReason: finish('stop'),
        usage,
        warnings: [],
        response: {
          id: 'mock-resp-1',
          modelId: 'mock-model',
          timestamp: new Date('2026-01-01T00:00:00Z'),
        },
      });
    },
    doStream: () => {
      return Promise.reject(new Error('not used'));
    },
  };
}

function makeAppWithModel(providerName: string, model: LanguageModelV4) {
  const fakeProvider = { languageModel: () => model };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;

  return createApp({ registry });
}

describe('system prompts must reach upstream on all text routes', () => {
  it('chat completions: system message → 200 and system content reaches upstream', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'openai',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const { status } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'Say hi' },
      ],
    });

    expect(status).toBe(200);
    expect(callOptions?.prompt.some((m) => m.role === 'system')).toBe(true);
  });

  it('messages: top-level system param → 200 and system content reaches upstream', async () => {
    let callOptions: LanguageModelV4CallOptions | undefined;
    const app = makeAppWithModel(
      'anthropic',
      createRecordingModel({
        onCall: (options) => {
          callOptions = options;
        },
      }),
    );

    const { status } = await postJson(app, '/v1/messages', {
      model: 'anthropic/claude-sonnet-4-20250514',
      max_tokens: 100,
      system: 'Be brief.',
      messages: [{ role: 'user', content: 'Say hi' }],
    });

    expect(status).toBe(200);
    expect(callOptions?.prompt.some((m) => m.role === 'system')).toBe(true);
  });
});
