// Upstream 4xx error-body redaction.
//
// G34 (SP4): maskMessage only masks status>=500 in production; 4xx text is
// forwarded because it carries actionable client-side info. But a provider
// 401 body like `Incorrect API key provided: sk-proj-...abc1` contains a
// fragment of the GATEWAY OPERATOR's credential. In a multi-tenant gateway
// the downstream client is not the credential owner, so echoing that
// fragment is a credential-correlation leak. `redactKeyFragments` strips
// key-shaped tokens from every upstream-derived message (envelope.ts,
// streamError.ts) while the rest of the 4xx text passes through.

import { describe, expect, it } from 'vitest';
import type { LanguageModelV4 } from '@ai-sdk/provider';

import { createApp } from '../../packages/gateway/src/app.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { postJson } from '../__helpers/gateway/post-json.js';

const KEY_FRAGMENT = 'sk-proj-abcd1234efgh5678';

// The gateway's envelope routes AI SDK `APICallError`s through the verbatim
// 4xx passthrough (envelope.ts:404-417). `APICallError.isInstance` only checks
// for this well-known marker symbol, so we stamp a plain error with it to
// exercise the exact provider-error branch at the public seam — the `ai`
// runtime package isn't resolvable from the root workspace test project.
const API_CALL_ERROR_MARKER = Symbol.for('vercel.ai.error.AI_APICallError');

/** A model whose upstream call throws a provider 401 with a key-shaped token. */
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
    defaultObjectGenerationMode: undefined,
    get supportedUrls() { return Promise.resolve({}); },
    doGenerate: () => Promise.reject(error),
    doStream: () => Promise.reject(error),
  } as LanguageModelV4;
}

function makeAppWithMockProvider(providerName: string) {
  const fakeProvider = { languageModel: () => createKeyLeakModel() };
  const registry = { [providerName]: fakeProvider } as unknown as ProviderRegistry;
  return createApp({ registry });
}

describe('gateway integration — 4xx credential-fragment redaction (G34)', () => {
  // A client triggers an upstream 401. In production the client-facing body
  // must NOT contain the operator's raw key fragment — the key-shaped token
  // is redacted (redactKeyFragments) while the rest of the actionable 4xx
  // text passes through.
  it('does not echo the operator key fragment in a chat 401 (OpenAI envelope)', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const app = makeAppWithMockProvider('openai');
      const { status, body } = await postJson(app, '/v1/chat/completions', {
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(status).toBe(401);
      expect(JSON.stringify(body)).not.toContain(KEY_FRAGMENT);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  // Same leak on the Anthropic envelope path (/v1/messages).
  it('does not echo the operator key fragment in a messages 401 (Anthropic envelope)', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const app = makeAppWithMockProvider('anthropic');
      const { status, body } = await postJson(app, '/v1/messages', {
        model: 'anthropic/test-model',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 100,
      });

      expect(status).toBe(401);
      expect(JSON.stringify(body)).not.toContain(KEY_FRAGMENT);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
