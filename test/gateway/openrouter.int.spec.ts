import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGateway } from '../../packages/gateway/src/gateway.js';
import type { AfterOperationHookArgs } from '../../packages/gateway/src/hooks.js';
import { calculateModelCostUSD } from '../../packages/gateway/src/providers/cost.js';

const MODEL = 'openrouter/anthropic/claude-sonnet-4.6';

const USAGE = {
  prompt_tokens: 1200,
  prompt_tokens_details: { cached_tokens: 1000, cache_write_tokens: 150 },
  completion_tokens: 40,
  completion_tokens_details: { reasoning_tokens: 25 },
  total_tokens: 1240,
  cost: 0.0042,
};

const COMPLETION = {
  id: 'gen-1790000000-abc',
  provider: 'Anthropic',
  model: 'anthropic/claude-sonnet-4.6',
  object: 'chat.completion',
  created: 1_790_000_000,
  choices: [
    {
      index: 0,
      finish_reason: 'stop',
      message: { role: 'assistant', content: 'ok', reasoning: 'thinking about it' },
    },
  ],
  usage: USAGE,
};

const CHUNKS = [
  {
    id: 'gen-1790000000-abc',
    provider: 'Anthropic',
    model: 'anthropic/claude-sonnet-4.6',
    object: 'chat.completion.chunk',
    created: 1_790_000_000,
    choices: [
      { index: 0, delta: { role: 'assistant', reasoning: 'thinking' }, finish_reason: null },
    ],
  },
  {
    id: 'gen-1790000000-abc',
    provider: 'Anthropic',
    model: 'anthropic/claude-sonnet-4.6',
    object: 'chat.completion.chunk',
    created: 1_790_000_000,
    choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: null }],
  },
  {
    id: 'gen-1790000000-abc',
    provider: 'Anthropic',
    model: 'anthropic/claude-sonnet-4.6',
    object: 'chat.completion.chunk',
    created: 1_790_000_000,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage: USAGE,
  },
];

type Captured = { url: string; headers: Headers; body: Record<string, unknown> };

let captured: Captured[];
let upstream: () => Response;

function sse() {
  const text = [...CHUNKS.map((chunk) => JSON.stringify(chunk)), '[DONE]']
    .map((data) => `data: ${data}\n\n`)
    .join('');

  return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
}

beforeEach(() => {
  captured = [];
  upstream = () => Response.json(COMPLETION);

  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    captured.push({ url: String(input), headers: new Headers(init?.headers), body });

    return Promise.resolve(body.stream === true ? sse() : upstream());
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeGateway() {
  const operations: AfterOperationHookArgs[] = [];

  const gateway = createGateway({
    providers: { openrouter: { apiKey: 'sk-or-v1-secret-test-key' } },
    hooks: { afterOperation: [(args) => void operations.push(args)] },
  });

  return { gateway, operations };
}

async function post(path: string, body: unknown) {
  const { gateway, operations } = makeGateway();

  const response = await gateway.handler(
    new Request(`http://localhost/v1${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

  const text = await response.text();

  return { status: response.status, text, operations, upstream: captured[0] };
}

const cachedSystem = [
  { type: 'text', text: 'You are terse.', cache_control: { type: 'ephemeral' } },
];

describe('OpenRouter over Chat Completions', () => {
  for (const stream of [false, true]) {
    it(`sends reasoning, cache_control, routing and attribution (stream: ${stream})`, async () => {
      const { status, text, upstream } = await post('/chat/completions', {
        model: MODEL,
        stream,
        reasoning_effort: 'high',
        provider: { order: ['anthropic', 'amazon-bedrock'], allow_fallbacks: false },
        models: ['anthropic/claude-sonnet-4.5'],
        messages: [
          { role: 'system', content: 'You are terse.', cache_control: { type: 'ephemeral' } },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'hi', cache_control: { type: 'ephemeral', ttl: '1h' } },
            ],
          },
        ],
      });

      expect(status, text).toBe(200);
      expect(upstream?.url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(upstream?.body.model).toBe('anthropic/claude-sonnet-4.6');
      expect(upstream?.body.reasoning).toEqual({ effort: 'high' });
      expect(upstream?.body).not.toHaveProperty('reasoningEffort');
      expect(upstream?.body.provider).toEqual({
        order: ['anthropic', 'amazon-bedrock'],
        allow_fallbacks: false,
      });
      expect(upstream?.body.models).toEqual(['anthropic/claude-sonnet-4.5']);
      expect(upstream?.body.messages).toEqual([
        {
          role: 'system',
          content: [{ type: 'text', text: 'You are terse.', cache_control: { type: 'ephemeral' } }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'hi', cache_control: { type: 'ephemeral', ttl: '1h' } }],
        },
      ]);
      expect(upstream?.headers.get('http-referer')).toBe('https://www.frogbot.ai');
      expect(upstream?.headers.get('x-openrouter-title')).toBe('FrogBot');
    });
  }

  it('reports cached-read, cache-write and reasoning tokens with a non-zero catalog cost', async () => {
    const { status, text, operations } = await post('/chat/completions', {
      model: MODEL,
      messages: [{ role: 'user', content: 'hi' }],
    });

    const usage = operations[0]?.usage;

    expect(status, text).toBe(200);
    expect(JSON.parse(text).usage).toMatchObject({
      prompt_tokens: 1200,
      completion_tokens: 40,
      prompt_tokens_details: { cached_tokens: 1000 },
      completion_tokens_details: { reasoning_tokens: 25 },
    });
    expect(usage).toMatchObject({
      inputTokens: 1200,
      outputTokens: 40,
      cachedInputTokens: 1000,
      cacheWriteTokens: 150,
      reasoningTokens: 25,
    });
    expect(calculateModelCostUSD(MODEL, usage!)).toBeGreaterThan(0);
  });

  it('maps an OpenRouter 402 to a billing error without leaking the key', async () => {
    upstream = () =>
      Response.json(
        {
          error: {
            code: 402,
            message: 'Insufficient credits. Add more using https://openrouter.ai/credits',
          },
        },
        { status: 402 },
      );

    const { status, text } = await post('/chat/completions', {
      model: MODEL,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(402);
    expect(JSON.parse(text).error.message).toContain('Insufficient credits');
    expect(text).not.toContain('sk-or-v1-secret-test-key');
  });

  it('rejects an uncataloged model before any upstream call', async () => {
    const { status, text } = await post('/chat/completions', {
      model: 'openrouter/openrouter/auto',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(404);
    expect(JSON.parse(text).error.code).toBe('model_not_found');
    expect(captured).toHaveLength(0);
  });
});

describe('OpenRouter over Messages', () => {
  for (const stream of [false, true]) {
    it(`translates thinking and keeps cache_control (stream: ${stream})`, async () => {
      const { status, text, upstream } = await post('/messages', {
        model: MODEL,
        stream,
        max_tokens: 4096,
        thinking: { type: 'enabled', budget_tokens: 2048 },
        system: cachedSystem,
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(status, text).toBe(200);
      expect(upstream?.body.reasoning).toEqual({ max_tokens: 2048 });
      expect(upstream?.body).not.toHaveProperty('thinking');
      expect(JSON.stringify(upstream?.body.messages)).toContain(
        '"cache_control":{"type":"ephemeral"}',
      );
      expect(text).toContain('thinking');
    });
  }

  it('maps an OpenRouter 402 to an Anthropic billing_error', async () => {
    upstream = () =>
      Response.json({ error: { code: 402, message: 'Insufficient credits' } }, { status: 402 });

    const { status, text } = await post('/messages', {
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(402);
    expect(JSON.parse(text).error).toMatchObject({ type: 'billing_error' });
  });

  it('sends disabled thinking as effort none', async () => {
    const { status, text, upstream } = await post('/messages', {
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status, text).toBe(200);
    expect(upstream?.body.reasoning).toEqual({ effort: 'none' });
  });
});

describe('OpenRouter over Responses', () => {
  for (const stream of [false, true]) {
    it(`translates reasoning.effort (stream: ${stream})`, async () => {
      const { status, text, upstream } = await post('/responses', {
        model: MODEL,
        stream,
        reasoning: { effort: 'low' },
        input: 'hi',
      });

      expect(status, text).toBe(200);
      expect(upstream?.body.reasoning).toEqual({ effort: 'low' });
      expect(upstream?.body).not.toHaveProperty('reasoningEffort');
    });
  }
});

describe('OpenRouter embeddings', () => {
  it('rejects /v1/embeddings without an upstream call', async () => {
    const { status, text } = await post('/embeddings', {
      model: 'openrouter/openai/text-embedding-3-small',
      input: 'hi',
    });

    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    expect(JSON.parse(text).error.code).toMatch(/model_not_found|unsupported/);
    expect(captured).toHaveLength(0);
  });
});

describe('OpenRouter adversarial cases', () => {
  it('routes a :free variant and sends the suffixed upstream ID', async () => {
    const { status, text, upstream, operations } = await post('/chat/completions', {
      model: 'openrouter/google/gemma-4-31b-it:free',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status, text).toBe(200);
    expect(upstream?.body.model).toBe('google/gemma-4-31b-it:free');
    expect(
      calculateModelCostUSD('openrouter/google/gemma-4-31b-it:free', operations[0].usage!),
    ).toBe(0);
  });

  it('keeps a native reasoning object over reasoning_effort on chat', async () => {
    const { status, text, upstream } = await post('/chat/completions', {
      model: MODEL,
      reasoning_effort: 'high',
      reasoning: { max_tokens: 512 },
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status, text).toBe(200);
    expect(upstream?.body.reasoning).toEqual({ max_tokens: 512 });
    expect(upstream?.body).not.toHaveProperty('reasoning_effort');
  });

  it('keeps an explicit hook-set openrouter.reasoning over reasoning_effort', async () => {
    const gateway = createGateway({
      providers: { openrouter: { apiKey: 'sk-or-v1-secret-test-key' } },
      hooks: {
        beforeUpstream: [
          (args) => {
            args.providerOptions.openrouter = { reasoning: { effort: 'minimal' } };
          },
        ],
      },
    });

    const response = await gateway.handler(
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          reasoning_effort: 'high',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      }),
    );

    expect(response.status, await response.text()).toBe(200);
    expect(captured[0]?.body.reasoning).toEqual({ effort: 'minimal' });
    expect(captured[0]?.body).not.toHaveProperty('reasoning_effort');
  });

  it.each([
    { path: '/chat/completions', error: {} },
    { path: '/messages', error: { type: 'rate_limit_error' } },
    { path: '/responses', error: {} },
  ])('maps an OpenRouter 429 through the $path error envelope', async ({ path, error }) => {
    upstream = () =>
      Response.json(
        { error: { code: 429, message: 'Rate limit exceeded: free-models-per-min' } },
        { status: 429 },
      );

    const { status, text } = await post(path, {
      model: MODEL,
      max_tokens: 64,
      ...(path === '/responses'
        ? { input: 'hi' }
        : { messages: [{ role: 'user', content: 'hi' }] }),
    });

    expect(status).toBe(429);

    const body = JSON.parse(text);

    expect(JSON.stringify(body)).toContain('Rate limit exceeded');
    expect(body.error).toMatchObject(error);
  });

  it('redacts a key echoed by an OpenRouter error body', async () => {
    upstream = () =>
      Response.json(
        {
          error: {
            code: 401,
            message: 'Invalid key sk-or-v1-secret-test-key (Bearer sk-or-v1-secret-test-key)',
          },
        },
        { status: 401 },
      );

    const { status, text } = await post('/chat/completions', {
      model: MODEL,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(status).toBe(401);
    expect(text).not.toContain('secret-test-key');
    expect(text).toContain('REDACTED');
  });
});

describe('Raw provider clients', () => {
  async function chat(gateway: ReturnType<typeof createGateway>, model: string) {
    const response = await gateway.handler(
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }] }),
      }),
    );

    return { status: response.status, text: await response.text() };
  }

  it('uses a raw createOpenRouter() client and ignores models narrowing on it', async () => {
    const { createOpenRouter } = await import('@openrouter/ai-sdk-provider');
    const client = Object.assign(createOpenRouter({ apiKey: 'sk-or-v1-raw' }), {
      models: ['openai/gpt-5'],
    });

    const gateway = createGateway({ providers: { openrouter: client } as never });

    const { status, text } = await chat(gateway, MODEL);

    expect(status, text).toBe(200);
    expect(captured[0]?.body.model).toBe('anthropic/claude-sonnet-4.6');
    expect(captured[0]?.headers.get('authorization')).toBe('Bearer sk-or-v1-raw');
    expect(captured[0]?.headers.get('x-openrouter-title')).toBeNull();
  });

  it('enforces models narrowing on an OpenRouter config object', async () => {
    const gateway = createGateway({
      providers: { openrouter: { apiKey: 'sk-or-v1-x', models: ['openai/gpt-5'] } },
    });

    const { status } = await chat(gateway, MODEL);

    expect(status).toBe(404);
    expect(captured).toHaveLength(0);
  });

  it('accepts a real createOpenAI() instance for the openai provider', async () => {
    const { createOpenAI } = await import('@ai-sdk/openai');

    upstream = () =>
      Response.json({
        id: 'resp_1',
        object: 'response',
        created_at: 1,
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            id: 'msg_1',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'ok', annotations: [] }],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      });

    const gateway = createGateway({
      providers: { openai: createOpenAI({ apiKey: 'sk-raw-openai-instance' }) },
    });

    const { status, text } = await chat(gateway, 'openai/gpt-4o');

    expect(status, text).toBe(200);
    expect(JSON.parse(text).choices[0].message.content).toBe('ok');
    expect(captured[0]?.url).toBe('https://api.openai.com/v1/responses');
    expect(captured[0]?.headers.get('authorization')).toBe('Bearer sk-raw-openai-instance');
  });

  it('builds a settings object instead of treating it as an instance', async () => {
    const gateway = createGateway({
      providers: { openrouter: { apiKey: 'sk-or-v1-settings', appName: 'Custom' } },
    });

    const { status, text } = await chat(gateway, MODEL);

    expect(status, text).toBe(200);
    expect(captured[0]?.headers.get('x-openrouter-title')).toBe('Custom');
    expect(captured[0]?.headers.get('http-referer')).toBe('https://www.frogbot.ai');
  });
});
