import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigError } from '../../../../../packages/gateway/src/errors/gatewayError.js';
import { createGateway } from '../../../../../packages/gateway/src/gateway.js';
import { openrouterProvider } from '../../../../../packages/gateway/src/providers/openrouter/index.js';

const completion = {
  id: 'gen-test',
  object: 'chat.completion',
  created: 0,
  model: 'anthropic/claude-sonnet-4.6',
  choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

async function captureHeaders(config: Parameters<typeof openrouterProvider.build>[0]) {
  const fetch = vi.fn(async () => Response.json(completion));

  vi.stubGlobal('fetch', fetch);

  await openrouterProvider
    .build(config)
    .languageModel('anthropic/claude-sonnet-4.6')
    .doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] });

  const init = fetch.mock.calls[0]?.[1] as RequestInit | undefined;

  return new Headers(init?.headers);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenRouter provider', () => {
  it('discovers credentials only when OPENROUTER_API_KEY is set', () => {
    expect(openrouterProvider.envVars).toEqual(['OPENROUTER_API_KEY', 'OPENROUTER_BASE_URL']);
    expect(openrouterProvider.fromEnv({})).toBeUndefined();
    expect(openrouterProvider.fromEnv({ OPENROUTER_BASE_URL: 'https://or.test/v1' })).toBe(
      undefined,
    );
    expect(openrouterProvider.fromEnv({ OPENROUTER_API_KEY: 'sk-or-test' })).toEqual({
      apiKey: 'sk-or-test',
    });
    expect(
      openrouterProvider.fromEnv({
        OPENROUTER_API_KEY: 'sk-or-test',
        OPENROUTER_BASE_URL: 'https://or.test/v1',
      }),
    ).toEqual({ apiKey: 'sk-or-test', baseURL: 'https://or.test/v1' });
  });

  it('rejects missing shorthand credentials at gateway construction', () => {
    expect(() => createGateway({ providers: { openrouter: {} } })).toThrow(ConfigError);
  });

  it('identifies FrogBot to OpenRouter by default', async () => {
    const headers = await captureHeaders({ apiKey: 'sk-or-test' });

    expect(headers.get('authorization')).toBe('Bearer sk-or-test');
    expect(headers.get('http-referer')).toBe('https://www.frogbot.ai');
    expect(headers.get('x-openrouter-title')).toBe('FrogBot');
  });

  it('lets config override the attribution', async () => {
    const headers = await captureHeaders({
      apiKey: 'sk-or-test',
      appName: 'Acme',
      appUrl: 'https://acme.test',
    });

    expect(headers.get('http-referer')).toBe('https://acme.test');
    expect(headers.get('x-openrouter-title')).toBe('Acme');
  });

  it('uses a raw createOpenRouter() client as-is', () => {
    const client = createOpenRouter({ apiKey: 'sk-or-test' });

    const gateway = createGateway({ providers: { openrouter: client } });

    expect(gateway.registry.openrouter).toBe(client);
  });
});
