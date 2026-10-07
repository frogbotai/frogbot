import type { LanguageModelV4 } from '@ai-sdk/provider';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

const KEY_FRAGMENT = 'sk-proj-abcd1234efgh5678';

const API_CALL_ERROR_MARKER = Symbol.for('vercel.ai.error.AI_APICallError');

function createKeyLeakModel(): LanguageModelV4 {
  const message = `Incorrect API key provided: ${KEY_FRAGMENT}. You can find your API key at https://platform.openai.com/account/api-keys.`;
  const error = Object.assign(new Error(message), {
    [API_CALL_ERROR_MARKER]: true,
    statusCode: 401,
    url: 'https://api.openai.com/v1/chat/completions',
    requestBodyValues: {},
    isRetryable: false,
    responseBody: JSON.stringify({
      error: { message, type: 'invalid_request_error', code: 'invalid_api_key' },
    }),
  });

  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-model',
    get supportedUrls() {
      return Promise.resolve({});
    },
    doGenerate: () => Promise.reject(error),
    doStream: () => Promise.reject(error),
  };
}

function makeAppWithMockProvider(providerName: string) {
  const fakeProvider = { languageModel: () => createKeyLeakModel() };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;

  return createApp({ registry });
}

describe('gateway integration — 4xx credential-fragment redaction (G34)', () => {
  it('does not echo the operator key fragment in a chat 401 (OpenAI envelope)', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    onTestFinished(() => {
      vi.unstubAllEnvs();
    });

    const app = makeAppWithMockProvider('openai');
    const { status, body } = await postJson(app, '/v1/chat/completions', {
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(401);
    expect(JSON.stringify(body)).not.toContain(KEY_FRAGMENT);
  });

  it('does not echo the operator key fragment in a messages 401 (Anthropic envelope)', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    onTestFinished(() => {
      vi.unstubAllEnvs();
    });

    const app = makeAppWithMockProvider('anthropic');
    const { status, body } = await postJson(app, '/v1/messages', {
      model: 'anthropic/test-model',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
    });

    expect(status).toBe(401);
    expect(JSON.stringify(body)).not.toContain(KEY_FRAGMENT);
  });
});
