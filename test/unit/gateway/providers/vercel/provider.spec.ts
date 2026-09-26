import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildProvidersFromEnv } from '../../../../../packages/gateway/src/cli/index.js';
import {
  ConfigError,
  ModelNotFoundError,
  ModelUnsupportedOperationError,
} from '../../../../../packages/gateway/src/errors/gatewayError.js';
import { createGateway } from '../../../../../packages/gateway/src/gateway.js';
import { DEFAULT_MODEL_CATALOG } from '../../../../../packages/gateway/src/providers/catalog.data.js';
import {
  buildProviderRegistry,
  resolveProvider,
} from '../../../../../packages/gateway/src/providers/registry.js';
import { vercelProvider } from '../../../../../packages/gateway/src/providers/vercel/index.js';

const GENERATE_BODY = {
  content: [{ type: 'text', text: 'ok' }],
  finishReason: { unified: 'stop', raw: 'stop' },
  usage: {
    inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  },
};

async function captureHeaders(headers?: Record<string, string>): Promise<Headers> {
  const fetchMock = vi.fn<typeof fetch>(() =>
    Promise.resolve(Response.json(GENERATE_BODY, { status: 200 })),
  );

  vi.stubGlobal('fetch', fetchMock);

  const provider = vercelProvider.build({ apiKey: 'test-key', ...(headers && { headers }) });

  await provider.languageModel('anthropic/claude-sonnet-4.6').doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  });

  const init = fetchMock.mock.calls[0]?.[1];

  return new Headers(init?.headers);
}

describe('Vercel AI Gateway provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('is enabled only by AI_GATEWAY_API_KEY', () => {
    expect(vercelProvider.envVars[0]).toBe('AI_GATEWAY_API_KEY');
    expect(vercelProvider.fromEnv({})).toBeUndefined();

    expect(
      vercelProvider.fromEnv({
        AI_GATEWAY_API_KEY: 'key',
        AI_GATEWAY_BASE_URL: 'https://example.test/v4/ai',
      }),
    ).toEqual({ apiKey: 'key', baseURL: 'https://example.test/v4/ai' });
  });

  it('is not enabled by a Vercel OIDC token alone', () => {
    const env = { VERCEL_OIDC_TOKEN: 'oidc-token', VERCEL: '1' };

    expect(vercelProvider.fromEnv(env)).toBeUndefined();
    expect(buildProvidersFromEnv(env)).not.toHaveProperty('vercel');
  });

  it('rejects explicit config without an API key', () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token');

    expect(() => createGateway({ providers: { vercel: {} } })).toThrow(ConfigError);
  });

  it('sends FrogBot attribution headers by default', async () => {
    const headers = await captureHeaders();

    expect(headers.get('authorization')).toBe('Bearer test-key');
    expect(headers.get('http-referer')).toBe('https://www.frogbot.ai');
    expect(headers.get('x-title')).toBe('FrogBot');
    expect(headers.get('ai-language-model-id')).toBe('anthropic/claude-sonnet-4.6');
  });

  it('lets config override attribution headers regardless of case', async () => {
    const headers = await captureHeaders({ 'X-Title': 'Acme', 'x-extra': '1' });

    expect(headers.get('x-title')).toBe('Acme');
    expect(headers.get('http-referer')).toBe('https://www.frogbot.ai');
    expect(headers.get('x-extra')).toBe('1');
  });

  it('accepts cataloged chat models and rejects other IDs and operations', () => {
    const registry = buildProviderRegistry({ vercel: { apiKey: 'key' } });

    const resolve = (modelId: string, operation: 'chat.completions' | 'embeddings') =>
      resolveProvider({ modelId, operation, providers: registry, models: DEFAULT_MODEL_CATALOG });

    expect(resolve('vercel/anthropic/claude-sonnet-4.6', 'chat.completions')).toMatchObject({
      providerName: 'vercel',
      modelName: 'anthropic/claude-sonnet-4.6',
    });

    expect(() => resolve('vercel/acme/not-a-model', 'chat.completions')).toThrow(
      ModelNotFoundError,
    );

    expect(() => resolve('vercel/anthropic/claude-sonnet-4.6', 'embeddings')).toThrow(
      ModelUnsupportedOperationError,
    );
  });
});
