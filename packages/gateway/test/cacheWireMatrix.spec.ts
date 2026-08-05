import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAnthropicAws } from '@ai-sdk/anthropic-aws';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex';
import { createOpenAI } from '@ai-sdk/openai';
import { describe, expect, it } from 'vitest';

import { postJson } from '../../../test/__helpers/gateway/post-json.js';
import { createApp } from '../src/app.js';
import type { ProviderRegistry } from '../src/providers/registry.js';

type CapturedRequest = {
  body: Record<string, unknown>;
  url: string;
};

type ProviderFactory = (fetch: typeof globalThis.fetch) => ProviderRegistry[string];

const successBodies = {
  anthropic: {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'ok' }],
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  },
  bedrock: {
    output: { message: { role: 'assistant', content: [{ text: 'ok' }] } },
    stopReason: 'end_turn',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    metrics: { latencyMs: 1 },
  },
  google: {
    candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP', index: 0 }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
  },
  openai: {
    id: 'chatcmpl_test',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-4o-mini',
    choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  },
} as const;

function buildCacheApp(args: {
  providerName: string;
  providerFactory: ProviderFactory;
  successBody: unknown;
}) {
  const requests: CapturedRequest[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push({
      body,
      url: input instanceof Request ? input.url : String(input),
    });
    if (body.stream === true) {
      const chunks = args.providerName === 'openai'
        ? [
            { id: 'chatcmpl_test', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o-mini', choices: [{ index: 0, delta: { role: 'assistant', content: 'ok' }, finish_reason: null }] },
            { id: 'chatcmpl_test', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o-mini', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
          ]
        : [
            { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', content: [], model: 'claude-sonnet-4-20250514', stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
            { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
            { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } },
            { type: 'content_block_stop', index: 0 },
            { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } },
            { type: 'message_stop' },
          ];
      const text = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('');
      return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
    }
    return Response.json(args.successBody);
  };
  const provider = args.providerFactory(fetch as typeof globalThis.fetch);
  const registry = { [args.providerName]: provider } as ProviderRegistry;
  return { app: createApp({ registry }), requests };
}

const providers = [
  {
    name: 'anthropic-aws',
    model: 'claude-sonnet-4-20250514',
    successBody: successBodies.anthropic,
    factory: (fetch: typeof globalThis.fetch) => createAnthropicAws({ apiKey: 'test', region: 'us-east-1', workspaceId: 'test', fetch }),
  },
  {
    name: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    successBody: successBodies.anthropic,
    factory: (fetch: typeof globalThis.fetch) => createAnthropic({ apiKey: 'test', fetch }),
  },
  {
    name: 'amazon-bedrock',
    model: 'anthropic.claude-sonnet-4-20250514-v1:0',
    successBody: successBodies.bedrock,
    factory: (fetch: typeof globalThis.fetch) => createAmazonBedrock({ apiKey: 'test', region: 'us-east-1', fetch }),
  },
  {
    name: 'openai',
    model: 'gpt-4o-mini',
    successBody: successBodies.openai,
    factory: (fetch: typeof globalThis.fetch) => {
      const provider = createOpenAI({ apiKey: 'test', fetch });
      return { ...provider, languageModel: provider.chat } as ProviderRegistry[string];
    },
  },
  {
    name: 'google',
    model: 'gemini-2.5-flash',
    successBody: successBodies.google,
    factory: (fetch: typeof globalThis.fetch) => createGoogleGenerativeAI({ apiKey: 'test', fetch }),
  },
  {
    name: 'vertex',
    model: 'gemini-2.5-flash',
    successBody: successBodies.google,
    factory: (fetch: typeof globalThis.fetch) => createVertex({ apiKey: 'test', location: 'global', fetch }),
  },
] satisfies Array<{
  name: string;
  model: string;
  successBody: unknown;
  factory: ProviderFactory;
}>;

describe('cache wire matrix harness', () => {
  for (const provider of providers) {
    it(`captures a real ${provider.name} SDK request`, async () => {
      const { app, requests } = buildCacheApp({
        providerName: provider.name,
        providerFactory: provider.factory,
        successBody: provider.successBody,
      });
      const { status } = await postJson(app, '/v1/chat/completions', {
        model: `${provider.name}/${provider.model}`,
        messages: [{ role: 'user', content: 'hello' }],
      });

      expect(status).toBe(200);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.body).toBeTypeOf('object');
      expect(`${decodeURIComponent(requests[0]?.url ?? '')}${JSON.stringify(requests[0]?.body)}`).toContain(provider.model);
    });
  }
});

type WireCase = {
  name: string;
  provider: (typeof providers)[number]['name'];
  route: '/v1/chat/completions' | '/v1/messages';
  body: Record<string, unknown>;
  assertBody: (body: Record<string, any>) => void;
  fails?: boolean;
  model?: string;
};

const wireCases: WireCase[] = [
  {
    name: 'anthropic messages request cache control',
    provider: 'anthropic',
    route: '/v1/messages',
    body: { cache_control: { type: 'ephemeral', ttl: '1h' }, messages: [{ role: 'user', content: 'hello' }] },
    assertBody: (body) => expect(body.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' }),
    fails: true,
  },
  {
    name: 'anthropic messages system cache control',
    provider: 'anthropic',
    route: '/v1/messages',
    body: { system: [{ type: 'text', text: 'system', cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: 'hello' }] },
    assertBody: (body) => expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' }),
  },
  {
    name: 'anthropic messages content cache control',
    provider: 'anthropic',
    route: '/v1/messages',
    body: { messages: [{ role: 'user', content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }] }] },
    assertBody: (body) => expect(body.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' }),
  },
  {
    name: 'anthropic messages tool cache control',
    provider: 'anthropic',
    route: '/v1/messages',
    body: {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ name: 'weather', description: 'Weather', input_schema: { type: 'object', properties: {} }, cache_control: { type: 'ephemeral' } }],
    },
    assertBody: (body) => expect(body.tools[0].cache_control).toEqual({ type: 'ephemeral' }),
  },
  {
    name: 'anthropic chat content cache control',
    provider: 'anthropic',
    route: '/v1/chat/completions',
    body: { messages: [{ role: 'user', content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }] }] },
    assertBody: (body) => expect(body.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' }),
  },
  {
    name: 'anthropic aws content cache control',
    provider: 'anthropic-aws',
    route: '/v1/messages',
    body: { messages: [{ role: 'user', content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }] }] },
    assertBody: (body) => expect(body.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' }),
  },
  {
    name: 'bedrock request cache point',
    provider: 'amazon-bedrock',
    route: '/v1/chat/completions',
    body: { cache_control: { type: 'ephemeral', ttl: '1h' }, messages: [{ role: 'user', content: 'hello' }] },
    assertBody: (body) => expect(body.messages[0].content[1].cachePoint).toEqual({ type: 'default', ttl: '1h' }),
  },
  {
    name: 'bedrock system cache point',
    provider: 'amazon-bedrock',
    route: '/v1/messages',
    body: { system: [{ type: 'text', text: 'system', cache_control: { type: 'ephemeral', ttl: '5m' } }], messages: [{ role: 'user', content: 'hello' }] },
    assertBody: (body) => expect(body.system[1].cachePoint).toEqual({ type: 'default', ttl: '5m' }),
  },
  {
    name: 'bedrock non-Anthropic model has no cache point',
    provider: 'amazon-bedrock',
    model: 'amazon.nova-pro-v1:0',
    route: '/v1/chat/completions',
    body: { cache_control: { type: 'ephemeral' }, messages: [{ role: 'user', content: 'hello' }] },
    assertBody: (body) => expect(JSON.stringify(body)).not.toContain('cachePoint'),
  },
  {
    name: 'bedrock content cache point',
    provider: 'amazon-bedrock',
    route: '/v1/messages',
    body: { messages: [{ role: 'user', content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }] }] },
    assertBody: (body) => expect(body.messages[0].content[1].cachePoint).toEqual({ type: 'default' }),
  },
  {
    name: 'openai request cache key and retention',
    provider: 'openai',
    route: '/v1/chat/completions',
    body: { prompt_cache_key: 'cache-key', prompt_cache_retention: '24h', messages: [{ role: 'user', content: 'hello' }] },
    assertBody: (body) => {
      expect(body.prompt_cache_key).toBe('cache-key');
      expect(body.prompt_cache_retention).toBe('24h');
    },
  },
  {
    name: 'openai message cache breakpoint',
    provider: 'openai',
    route: '/v1/chat/completions',
    body: { messages: [{ role: 'user', content: 'hello', cache_control: { type: 'ephemeral' } }] },
    assertBody: (body) => expect(body.messages[0].content[0].prompt_cache_breakpoint).toEqual({ mode: 'explicit' }),
    fails: true,
  },
  {
    name: 'openai content cache breakpoint',
    provider: 'openai',
    route: '/v1/chat/completions',
    body: { messages: [{ role: 'user', content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }] }] },
    assertBody: (body) => expect(body.messages[0].content[0].prompt_cache_breakpoint).toEqual({ mode: 'explicit' }),
  },
  {
    name: 'google cached content',
    provider: 'google',
    route: '/v1/chat/completions',
    body: { cached_content: 'cachedContents/example', messages: [{ role: 'user', content: 'hello' }] },
    assertBody: (body) => expect(body.cachedContent).toBe('cachedContents/example'),
  },
  {
    name: 'vertex cached content',
    provider: 'vertex',
    route: '/v1/chat/completions',
    body: { cached_content: 'cachedContents/example', messages: [{ role: 'user', content: 'hello' }] },
    assertBody: (body) => expect(body.cachedContent).toBe('cachedContents/example'),
  },
];

describe('cache wire matrix', () => {
  it.each(wireCases.filter((wireCase) => !wireCase.fails))('$name', async (wireCase) => {
    const provider = providers.find((entry) => entry.name === wireCase.provider);
    if (!provider) throw new Error(`Missing provider ${wireCase.provider}`);
    const { app, requests } = buildCacheApp({
      providerName: provider.name,
      providerFactory: provider.factory,
      successBody: provider.successBody,
    });
    const { status, body } = await postJson(app, wireCase.route, {
      model: `${provider.name}/${wireCase.model ?? provider.model}`,
      max_tokens: 32,
      ...wireCase.body,
    });

    expect(status, JSON.stringify(body)).toBe(200);
    expect(requests).toHaveLength(1);
    wireCase.assertBody(requests[0]!.body);
  });

  it.fails.each(wireCases.filter((wireCase) => wireCase.fails))('$name', async (wireCase) => {
    const provider = providers.find((entry) => entry.name === wireCase.provider);
    if (!provider) throw new Error(`Missing provider ${wireCase.provider}`);
    const { app, requests } = buildCacheApp({
      providerName: provider.name,
      providerFactory: provider.factory,
      successBody: provider.successBody,
    });
    const { status, body } = await postJson(app, wireCase.route, {
      model: `${provider.name}/${wireCase.model ?? provider.model}`,
      max_tokens: 32,
      ...wireCase.body,
    });

    expect(status, JSON.stringify(body)).toBe(200);
    expect(requests).toHaveLength(1);
    wireCase.assertBody(requests[0]!.body);
  });
});

describe('cache wire streaming matrix', () => {
  for (const route of ['/v1/chat/completions', '/v1/messages'] as const) {
    const provider = providers.find((entry) => entry.name === 'anthropic')!;
    it(`captures Anthropic cache control for streaming ${route}`, async () => {
      const { app, requests } = buildCacheApp({
        providerName: provider.name,
        providerFactory: provider.factory,
        successBody: provider.successBody,
      });
      const requestBody = route === '/v1/messages'
        ? { model: `anthropic/${provider.model}`, max_tokens: 32, stream: true, messages: [{ role: 'user', content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }] }] }
        : { model: `anthropic/${provider.model}`, stream: true, messages: [{ role: 'user', content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }] }] };
      const response = await app.request(route, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      await response.text();

      expect(response.status).toBe(200);
      expect(requests[0]?.body.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ content: expect.arrayContaining([expect.objectContaining({ cache_control: { type: 'ephemeral' } })]) }),
      ]));
    });
  }

  it('captures OpenAI cache fields for streaming chat completions', async () => {
    const provider = providers.find((entry) => entry.name === 'openai')!;
    const { app, requests } = buildCacheApp({
      providerName: provider.name,
      providerFactory: provider.factory,
      successBody: provider.successBody,
    });
    const response = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: `openai/${provider.model}`,
        stream: true,
        prompt_cache_key: 'stream-key',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }] }],
      }),
    });
    await response.text();

    expect(response.status).toBe(200);
    expect(requests[0]?.body.prompt_cache_key).toBe('stream-key');
    expect((requests[0]?.body.messages as any[])[0].content[0].prompt_cache_breakpoint).toEqual({ mode: 'explicit' });
  });
});
