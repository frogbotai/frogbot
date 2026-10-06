// Vercel AI Gateway through the real routes and the real `@ai-sdk/gateway`
// adapter, with a recording `fetch` in place of AI Gateway. Response bodies
// follow the adapter's wire format: serialized LanguageModelV4 results and
// stream parts (see `@ai-sdk/gateway` gateway-language-model tests).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../packages/gateway/src/app.js';
import type { AfterOperationHookArgs } from '../../packages/gateway/src/hooks.js';
import { DEFAULT_MODEL_CATALOG } from '../../packages/gateway/src/providers/catalog.data.js';
import { calculateModelCostUSD } from '../../packages/gateway/src/providers/cost.js';
import { openaiProvider } from '../../packages/gateway/src/providers/openai/index.js';
import type { ProviderRegistry } from '../../packages/gateway/src/providers/registry.js';
import { vercelProvider } from '../../packages/gateway/src/providers/vercel/index.js';
import { postJson } from '../__helpers/gateway/post-json.js';
import { finish, mockUsage } from './mockModel.js';

const CLAUDE = 'vercel/anthropic/claude-sonnet-4.6';
const GPT = 'vercel/openai/gpt-5.4-mini';

const USAGE = mockUsage({
  inputTokens: { total: 1200, noCache: 200, cacheRead: 800, cacheWrite: 200 },
  outputTokens: { total: 50, text: 30, reasoning: 20 },
});

const FINISH_REASON = finish('stop', 'end_turn');

type UpstreamCall = {
  url: string;
  headers: Headers;
  body: {
    providerOptions?: Record<string, Record<string, unknown>>;
    prompt?: Array<{ providerOptions?: Record<string, Record<string, unknown>> }>;
  };
};

let calls: UpstreamCall[];
let operations: AfterOperationHookArgs[];

function streamBody(): string {
  const parts = [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: 'Hello' },
    { type: 'text-end', id: 't1' },
    { type: 'finish', finishReason: FINISH_REASON, usage: USAGE },
  ];

  return parts.map((part) => `data: ${JSON.stringify(part)}\n\n`).join('');
}

function stubAIGateway() {
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const headers = new Headers(init?.headers);

    calls.push({
      url: String(input),
      headers,
      body: JSON.parse(String(init?.body)) as UpstreamCall['body'],
    });

    if (headers.get('ai-language-model-streaming') === 'true') {
      return Promise.resolve(
        new Response(streamBody(), { headers: { 'content-type': 'text/event-stream' } }),
      );
    }

    return Promise.resolve(
      Response.json({
        content: [{ type: 'text', text: 'Hello' }],
        finishReason: FINISH_REASON,
        usage: USAGE,
        warnings: [],
      }),
    );
  });

  vi.stubGlobal('fetch', fetchMock);
}

function makeApp(registry: ProviderRegistry = { vercel: vercelProvider.build({ apiKey: 'key' }) }) {
  return createApp({
    registry,
    catalog: DEFAULT_MODEL_CATALOG,
    hooks: {
      afterOperation: [
        (args) => {
          operations.push(args);
        },
      ],
    },
  });
}

async function postStream(path: string, body: Record<string, unknown>) {
  const res = await makeApp().request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
  });

  return { status: res.status, text: await res.text() };
}

describe('Vercel AI Gateway provider — wire integration', () => {
  beforeEach(() => {
    calls = [];
    operations = [];
    stubAIGateway();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends Claude thinking, cache control and routing options on chat completions', async () => {
    const routing = { order: ['bedrock', 'anthropic'], only: ['bedrock', 'anthropic'] };

    const { status, body } = await postJson<{
      usage: { prompt_tokens_details?: { cached_tokens?: number } };
    }>(makeApp(), '/v1/chat/completions', {
      model: CLAUDE,
      max_tokens: 10_000,
      reasoning_effort: 'high',
      gateway: routing,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } }],
        },
      ],
    });

    expect(status).toBe(200);
    expect(calls).toHaveLength(1);

    const [call] = calls;

    expect(call?.url).toBe('https://ai-gateway.vercel.sh/v4/ai/language-model');
    expect(call?.headers.get('ai-language-model-id')).toBe('anthropic/claude-sonnet-4.6');
    expect(call?.headers.get('authorization')).toBe('Bearer key');
    expect(call?.headers.get('http-referer')).toBe('https://www.frogbot.ai');
    expect(call?.headers.get('x-title')).toBe('FrogBot');

    expect(call?.body.providerOptions?.gateway).toEqual(routing);
    expect(call?.body.providerOptions?.anthropic?.thinking).toEqual({
      type: 'enabled',
      budgetTokens: 8000,
    });
    expect(call?.body.providerOptions).not.toHaveProperty('vercel');
    expect(JSON.stringify(call?.body.prompt)).toContain('"anthropic":{"cacheControl"');

    expect(body.usage.prompt_tokens_details?.cached_tokens).toBe(800);
  });

  it('records cache-aware usage with a non-zero catalog cost', async () => {
    await postJson(makeApp(), '/v1/chat/completions', {
      model: CLAUDE,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const usage = operations[0]?.usage;

    expect(usage).toMatchObject({
      inputTokens: 1200,
      outputTokens: 50,
      cachedInputTokens: 800,
      cacheWriteTokens: 200,
      reasoningTokens: 20,
    });
    expect(calculateModelCostUSD(CLAUDE, usage!)).toBeGreaterThan(0);
  });

  it('streams chat completions with usage', async () => {
    const { status, text } = await postStream('/v1/chat/completions', {
      model: GPT,
      stream_options: { include_usage: true },
      reasoning_effort: 'low',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(200);
    expect(text).toContain('Hello');
    expect(text).toContain('"cached_tokens":800');
    expect(calls[0]?.headers.get('ai-language-model-streaming')).toBe('true');
    expect(calls[0]?.body.providerOptions?.openai?.reasoningEffort).toBe('low');
  });

  it('forwards Messages thinking and cache usage for Claude', async () => {
    const { status, body } = await postJson<{
      usage: { cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    }>(makeApp(), '/v1/messages', {
      model: CLAUDE,
      max_tokens: 10_000,
      thinking: { type: 'enabled', budget_tokens: 2048 },
      cache_control: { type: 'ephemeral' },
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(200);
    expect(calls[0]?.body.providerOptions?.anthropic).toMatchObject({
      thinking: { type: 'enabled', budgetTokens: 2048 },
      cacheControl: { type: 'ephemeral' },
    });
    expect(body.usage.cache_read_input_tokens).toBe(800);
    expect(body.usage.cache_creation_input_tokens).toBe(200);
  });

  it('streams Messages responses', async () => {
    const { status, text } = await postStream('/v1/messages', {
      model: CLAUDE,
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(200);
    expect(text).toContain('Hello');
    expect(text).toContain('message_stop');
  });

  it('translates Responses reasoning effort for Claude and OpenAI models', async () => {
    const claude = await postJson(makeApp(), '/v1/responses', {
      model: CLAUDE,
      input: 'hi',
      max_output_tokens: 10_000,
      reasoning: { effort: 'high' },
    });

    const gpt = await postJson(makeApp(), '/v1/responses', {
      model: GPT,
      input: 'hi',
      reasoning: { effort: 'low' },
    });

    expect(claude.status).toBe(200);
    expect(gpt.status).toBe(200);
    expect(calls[0]?.body.providerOptions?.anthropic?.thinking).toEqual({
      type: 'enabled',
      budgetTokens: 8000,
    });
    expect(calls[1]?.body.providerOptions?.openai?.reasoningEffort).toBe('low');
    expect(calls[1]?.body.providerOptions).not.toHaveProperty('unknown');
  });

  it('streams Responses output', async () => {
    const { status, text } = await postStream('/v1/responses', { model: GPT, input: 'hi' });

    expect(status).toBe(200);
    expect(text).toContain('response.completed');
    expect(text).toContain('Hello');
  });

  it('rejects an uncataloged model before any upstream call', async () => {
    const { status, body } = await postJson<{ error: { code: string } }>(
      makeApp(),
      '/v1/chat/completions',
      { model: 'vercel/acme/not-a-model', messages: [{ role: 'user', content: 'hi' }] },
    );

    expect(status).toBe(404);
    expect(body.error.code).toBe('model_not_found');
    expect(calls).toHaveLength(0);
  });

  it('reports the provider as not configured without a key', async () => {
    const other: ProviderRegistry = { openai: openaiProvider.build({ apiKey: 'unused' }) };

    const { status, body } = await postJson<{ error: { message: string } }>(
      makeApp(other),
      '/v1/chat/completions',
      { model: CLAUDE, messages: [{ role: 'user', content: 'hi' }] },
    );

    expect(status).not.toBe(200);
    expect(body.error.message).toMatch(/vercel/i);
    expect(body.error.message).toMatch(/not configured/i);
    expect(calls).toHaveLength(0);
  });
});

describe('Vercel AI Gateway provider — upstream errors', () => {
  const KEY_FRAGMENT = 'vck_abcd1234efgh5678ijkl';
  const FAST_RETRY = { 'retry-after-ms': '1' };

  function stubAIGatewayError(
    status: number,
    message: string,
    type: string,
    headers: Record<string, string> = {},
  ) {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json({ error: { message, type } }, { status, headers })),
      ),
    );
  }

  beforeEach(() => {
    calls = [];
    operations = [];
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps a 401 through the error envelope without echoing the key', async () => {
    stubAIGatewayError(401, `Invalid API key: ${KEY_FRAGMENT}`, 'authentication_error');

    const { status, body } = await postJson<{ error: { message: string; type: string } }>(
      makeApp(),
      '/v1/chat/completions',
      { model: CLAUDE, messages: [{ role: 'user', content: 'hi' }] },
    );

    expect(status).toBe(401);
    expect(body.error.type).toBe('authentication_error');
    expect(JSON.stringify(body)).not.toContain(KEY_FRAGMENT);
    expect(JSON.stringify(body)).not.toContain('Bearer key');
  });

  it('maps a 429 to rate_limit_error and forwards the upstream retry-after', async () => {
    stubAIGatewayError(429, `Rate limited for ${KEY_FRAGMENT}`, 'rate_limit_exceeded', {
      'retry-after': '7',
      ...FAST_RETRY,
    });

    const { status, headers, body } = await postJson<{
      error: { message: string; type: string; code: string | null };
    }>(makeApp(), '/v1/chat/completions', {
      model: CLAUDE,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(429);
    expect(body.error.type).toBe('rate_limit_error');
    expect(body.error.code).toBe('rate_limit_exceeded');
    expect(body.error.message).toContain('[REDACTED_KEY]');
    expect(JSON.stringify(body)).not.toContain(KEY_FRAGMENT);
    expect(headers.get('retry-after')).toBe('7');
    expect(headers.get('x-should-retry')).toBe('true');
  });

  it('maps a 401 on the Messages envelope', async () => {
    stubAIGatewayError(401, `Invalid API key: ${KEY_FRAGMENT}`, 'authentication_error');

    const { status, body } = await postJson<{ type: string; error: { type: string } }>(
      makeApp(),
      '/v1/messages',
      { model: CLAUDE, max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] },
    );

    expect(status).toBe(401);
    expect(body.type).toBe('error');
    expect(body.error.type).toBe('authentication_error');
  });

  it('masks a 5xx on the Messages envelope', async () => {
    stubAIGatewayError(
      503,
      `upstream failed for ${KEY_FRAGMENT}`,
      'internal_server_error',
      FAST_RETRY,
    );

    const { status, body } = await postJson<{ type: string; error: { message: string } }>(
      makeApp(),
      '/v1/messages',
      { model: CLAUDE, max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] },
    );

    expect(status).toBe(503);
    expect(body.type).toBe('error');
    expect(JSON.stringify(body)).not.toContain(KEY_FRAGMENT);
  });

  it('maps an unparseable 200 response to 502 on both envelopes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response('not json', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );

    const chat = await postJson<{ error: { type: string } }>(makeApp(), '/v1/chat/completions', {
      model: CLAUDE,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const messages = await postJson<{ error: { type: string } }>(makeApp(), '/v1/messages', {
      model: CLAUDE,
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(chat.status).toBe(502);
    expect(chat.body.error.type).toBe('server_error');
    expect(messages.status).toBe(502);
    expect(messages.body.error.type).toBe('api_error');
  });

  it.each([
    ['/v1/chat/completions', { messages: [{ role: 'user', content: 'hi' }] }],
    ['/v1/responses', { input: 'hi' }],
  ])('maps a streaming 401 on %s', async (path, request) => {
    stubAIGatewayError(401, `Invalid API key: ${KEY_FRAGMENT}`, 'authentication_error');

    const { status, text } = await postStream(path, { model: CLAUDE, ...request });

    const body = JSON.parse(text) as { error: { type: string } };

    expect(status).toBe(401);
    expect(body.error.type).toBe('authentication_error');
    expect(text).not.toContain(KEY_FRAGMENT);
  });

  it('maps a streaming 429 after retries are exhausted', async () => {
    stubAIGatewayError(429, `Rate limited for ${KEY_FRAGMENT}`, 'rate_limit_exceeded', FAST_RETRY);

    const { status, text } = await postStream('/v1/chat/completions', {
      model: CLAUDE,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const body = JSON.parse(text) as { error: { type: string } };

    expect(status).toBe(429);
    expect(body.error.type).toBe('rate_limit_error');
    expect(text).not.toContain(KEY_FRAGMENT);
  });

  it('maps a streaming 401 on the Messages route', async () => {
    stubAIGatewayError(401, `Invalid API key: ${KEY_FRAGMENT}`, 'authentication_error');

    const { status, text } = await postStream('/v1/messages', {
      model: CLAUDE,
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const body = JSON.parse(text) as { type: string; error: { type: string } };

    expect(status).toBe(401);
    expect(body.error.type).toBe('authentication_error');
  });
});
