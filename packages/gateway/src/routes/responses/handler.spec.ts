import { MockLanguageModelV4, MockProviderV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';
import type { ProviderRegistry } from '../../providers/registry.js';
import { forwardResponseParams } from './handler.js';
import { parseResponsesRequest } from './schema.js';

describe('responsesRoute', () => {
  it('serves non-streaming POST /v1/responses', async () => {
    const doGenerate = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'hello frog' }],
      finishReason: 'stop' as const,
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      warnings: [],
      response: { id: 'resp_test', modelId: 'gpt-4o-mini', timestamp: new Date('2026-07-03T00:00:00.000Z') },
    }));
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ languageModels: { 'gpt-4o-mini': new MockLanguageModelV4({ doGenerate }) } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
        previous_response_id: 'resp_prev',
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: 'resp_test',
      object: 'response',
      previous_response_id: 'resp_prev',
      output_text: 'hello frog',
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    });
    expect(doGenerate).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
    }));
  });

  it('routes responses operation through hooks', async () => {
    const beforeUpstream = vi.fn();
    const doGenerate = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'hi' }],
      finishReason: 'stop' as const,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    }));
    const app = createApp({
      registry: {
        anthropic: new MockProviderV4({
          languageModels: {
            'claude-sonnet-4': new MockLanguageModelV4({ doGenerate }),
          },
        }),
      } as unknown as ProviderRegistry,
      hooks: { beforeUpstream: [(args) => {
        beforeUpstream(args);
        args.params.temperature = 0.25;
      }] },
    });

    const res = await app.request('/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'anthropic/claude-sonnet-4', input: 'hi' }),
    });

    expect(res.status).toBe(200);
    expect(beforeUpstream).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'responses', provider: 'anthropic', providerOptions: {} }),
    );
    expect(doGenerate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.25 }));
  });

  it('passes tools, tool_choice, structured output, and instructions to the model', async () => {
    const doGenerate = vi.fn(async () => ({
      content: [
        { type: 'tool-call' as const, toolCallId: 'call_1', toolName: 'get_weather', input: JSON.stringify({ city: 'Paris' }) },
      ],
      finishReason: 'tool-calls' as const,
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      warnings: [],
      response: { id: 'resp_tools', modelId: 'gpt-4o-mini', timestamp: new Date('2026-07-03T00:00:00.000Z') },
    }));
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ languageModels: { 'gpt-4o-mini': new MockLanguageModelV4({ doGenerate }) } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        input: 'what is the weather',
        instructions: 'You are a weather bot',
        tools: [{ type: 'function', name: 'get_weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } }],
        tool_choice: 'auto',
        text: { format: { type: 'json_schema', name: 'weather', schema: { type: 'object', properties: { temp: { type: 'number' } } } } },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.output).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'function_call', name: 'get_weather', call_id: 'call_1' }),
    ]));

    const call = doGenerate.mock.calls[0][0] as Record<string, any>;
    expect(call.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'function', name: 'get_weather' }),
    ]));
    expect(call.toolChoice).toMatchObject({ type: 'auto' });
    expect(call.responseFormat).toMatchObject({ type: 'json' });
    const instructionMsg = call.prompt.find((m: any) => m.role === 'system');
    const instructionText = typeof instructionMsg?.content === 'string'
      ? instructionMsg.content
      : instructionMsg?.content?.map((p: any) => p.text).join('');
    expect(instructionText).toContain('You are a weather bot');
  });

  it('reflects parallel_tool_calls and envelope fields in the non-streaming response', async () => {
    const doGenerate = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'done' }],
      finishReason: 'stop' as const,
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      warnings: [],
      providerMetadata: { openai: { service_tier: 'flex' } },
      response: { id: 'resp_env', modelId: 'gpt-4o-mini', timestamp: new Date('2026-07-03T00:00:00.000Z') },
    }));
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ languageModels: { 'gpt-4o-mini': new MockLanguageModelV4({ doGenerate }) } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o-mini', input: 'hi', parallel_tool_calls: false }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'completed',
      incomplete_details: null,
      completed_at: 1783036800,
      error: null,
      parallel_tool_calls: false,
      service_tier: 'flex',
    });
  });

  it('returns an OpenAI-shaped error envelope when generateText throws', async () => {
    const doGenerate = vi.fn(async () => {
      throw new Error('upstream exploded');
    });
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ languageModels: { 'gpt-4o-mini': new MockLanguageModelV4({ doGenerate }) } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o-mini', input: 'hi' }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toMatchObject({ type: 'server_error', message: expect.any(String) });
  });

  it('serves streaming POST /v1/responses', async () => {
    const doStream = vi.fn(async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text-start', id: 'txt_1' });
          controller.enqueue({ type: 'text-delta', id: 'txt_1', delta: 'hello' });
          controller.enqueue({ type: 'text-delta', id: 'txt_1', delta: ' stream' });
          controller.enqueue({ type: 'text-end', id: 'txt_1' });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: { total: 3, noCache: 3 },
              outputTokens: { total: 2, text: 2 },
            },
          });
          controller.close();
        },
      }),
    }));
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ languageModels: { 'gpt-4o-mini': new MockLanguageModelV4({ doStream }) } }),
      } as unknown as ProviderRegistry,
    });

    const res = await app.request('/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o-mini', input: 'hi', stream: true }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('event: response.created');
    expect(text).toContain('event: response.output_text.delta');
    expect(text).toContain('"delta":"hello"');
    expect(text).toContain('event: response.completed');
    expect(text).not.toContain('[DONE]');
    expect(doStream).toHaveBeenCalledWith(expect.objectContaining({ includeRawChunks: true }));
  });
});

describe('forwardResponseParams', () => {
  const parse = (body: Record<string, unknown>) =>
    parseResponsesRequest({ model: 'x', input: 'hi', ...body });

  it('maps Group A cross-provider params to top-level AI SDK options', () => {
    const { params } = forwardResponseParams(
      parse({
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        max_output_tokens: 256,
        seed: 123,
        frequency_penalty: 0.5,
        presence_penalty: -0.5,
      }),
      'openai',
    );
    expect(params).toMatchObject({
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 256,
      seed: 123,
      frequencyPenalty: 0.5,
      presencePenalty: -0.5,
    });
  });

  it('normalizes a string stop into stopSequences array', () => {
    const { params } = forwardResponseParams(parse({ stop: 'STOP' }), 'openai');
    expect(params.stopSequences).toEqual(['STOP']);
  });

  it('passes through an array stop as stopSequences', () => {
    const { params } = forwardResponseParams(parse({ stop: ['STOP', 'END'] }), 'openai');
    expect(params.stopSequences).toEqual(['STOP', 'END']);
  });

  it('gates previous_response_id under providerOptions.openai for openai', () => {
    const { providerOptions } = forwardResponseParams(
      parse({ previous_response_id: 'resp_prev' }),
      'openai',
    );
    expect(providerOptions).toEqual({ openai: { previousResponseId: 'resp_prev' } });
  });

  it('drops previous_response_id for non-openai providers', () => {
    const { providerOptions } = forwardResponseParams(
      parse({ previous_response_id: 'resp_prev' }),
      'anthropic',
    );
    expect(providerOptions).toEqual({});
  });

  it('maps Group B OpenAI-specific params to providerOptions.openai', () => {
    const { providerOptions } = forwardResponseParams(
      parse({
        previous_response_id: 'resp_prev',
        user: 'user-1',
        metadata: { k: 'v' },
        store: true,
        parallel_tool_calls: false,
        truncation: 'auto',
        service_tier: 'flex',
        include: ['file_search_call.results'],
        prompt_cache_key: 'ck',
        prompt_cache_retention: '24h',
        safety_identifier: 'sid',
        max_tool_calls: 3,
      }),
      'openai',
    );
    expect(providerOptions.openai).toEqual({
      previousResponseId: 'resp_prev',
      user: 'user-1',
      metadata: { k: 'v' },
      store: true,
      parallelToolCalls: false,
      truncation: 'auto',
      serviceTier: 'flex',
      include: ['file_search_call.results'],
      promptCacheKey: 'ck',
      promptCacheRetention: '24h',
      safetyIdentifier: 'sid',
      maxToolCalls: 3,
    });
  });

  it('omits Group B params entirely for non-openai providers', () => {
    const { providerOptions } = forwardResponseParams(
      parse({ user: 'user-1', store: true, service_tier: 'flex' }),
      'anthropic',
    );
    expect(providerOptions).toEqual({});
  });

  it('leaves providerOptions empty when no OpenAI params are present', () => {
    const { providerOptions } = forwardResponseParams(parse({ temperature: 0.5 }), 'openai');
    expect(providerOptions).toEqual({});
  });
});

describe('responses schema validation', () => {
  it('accepts valid penalty ranges and a string stop', () => {
    const parsed = parseResponsesRequest({
      model: 'x',
      input: 'hi',
      frequency_penalty: 2,
      presence_penalty: -2,
      stop: 'STOP',
    });
    expect(parsed.frequency_penalty).toBe(2);
    expect(parsed.stop).toBe('STOP');
  });

  it('accepts an array stop', () => {
    const parsed = parseResponsesRequest({ model: 'x', input: 'hi', stop: ['A', 'B'] });
    expect(parsed.stop).toEqual(['A', 'B']);
  });

  it('rejects out-of-range frequency_penalty', () => {
    expect(() => parseResponsesRequest({ model: 'x', input: 'hi', frequency_penalty: 3 })).toThrow();
  });

  it('rejects an invalid truncation enum', () => {
    expect(() => parseResponsesRequest({ model: 'x', input: 'hi', truncation: 'nope' })).toThrow();
  });

  it('rejects an invalid service_tier enum', () => {
    expect(() => parseResponsesRequest({ model: 'x', input: 'hi', service_tier: 'turbo' })).toThrow();
  });
});

describe('responsesRoute param forwarding (non-streaming)', () => {
  const openaiApp = (doGenerate: ReturnType<typeof vi.fn>) =>
    createApp({
      registry: {
        openai: new MockProviderV4({ languageModels: { 'gpt-4o-mini': new MockLanguageModelV4({ doGenerate }) } }),
      } as unknown as ProviderRegistry,
    });

  const anthropicApp = (doGenerate: ReturnType<typeof vi.fn>) =>
    createApp({
      registry: {
        anthropic: new MockProviderV4({ languageModels: { 'claude-sonnet-4': new MockLanguageModelV4({ doGenerate }) } }),
      } as unknown as ProviderRegistry,
    });

  const okGenerate = () =>
    vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'ok' }],
      finishReason: 'stop' as const,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    }));

  it('forwards Group A params to the model call', async () => {
    const doGenerate = okGenerate();
    const res = await openaiApp(doGenerate).request('/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        input: 'hi',
        temperature: 0.4,
        top_p: 0.8,
        top_k: 20,
        seed: 7,
        frequency_penalty: 0.3,
        presence_penalty: 0.2,
        stop: 'STOP',
      }),
    });
    expect(res.status).toBe(200);
    const call = doGenerate.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toMatchObject({
      temperature: 0.4,
      topP: 0.8,
      topK: 20,
      seed: 7,
      frequencyPenalty: 0.3,
      presencePenalty: 0.2,
      stopSequences: ['STOP'],
    });
  });

  it('forwards Group B params under providerOptions.openai for openai', async () => {
    const doGenerate = okGenerate();
    const res = await openaiApp(doGenerate).request('/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        input: 'hi',
        previous_response_id: 'resp_prev',
        user: 'user-1',
        store: false,
        truncation: 'disabled',
        service_tier: 'priority',
        max_tool_calls: 2,
      }),
    });
    expect(res.status).toBe(200);
    const call = doGenerate.mock.calls[0][0] as { providerOptions?: Record<string, unknown> };
    expect(call.providerOptions).toMatchObject({
      openai: {
        previousResponseId: 'resp_prev',
        user: 'user-1',
        store: false,
        truncation: 'disabled',
        serviceTier: 'priority',
        maxToolCalls: 2,
      },
    });
  });

  it('does not forward previous_response_id to non-openai providerOptions', async () => {
    const doGenerate = okGenerate();
    const res = await anthropicApp(doGenerate).request('/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4',
        input: 'hi',
        previous_response_id: 'resp_prev',
        user: 'user-1',
      }),
    });
    expect(res.status).toBe(200);
    const call = doGenerate.mock.calls[0][0] as { providerOptions?: Record<string, unknown> };
    expect(call.providerOptions ?? {}).toEqual({});
  });
});

describe('responsesRoute param forwarding (streaming)', () => {
  const streamModel = () =>
    vi.fn(async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text-start', id: 'txt_1' });
          controller.enqueue({ type: 'text-delta', id: 'txt_1', delta: 'hi' });
          controller.enqueue({ type: 'text-end', id: 'txt_1' });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1, text: 1 } },
          });
          controller.close();
        },
      }),
    }));

  it('forwards Group A + Group B params identically in the streaming path', async () => {
    const doStream = streamModel();
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ languageModels: { 'gpt-4o-mini': new MockLanguageModelV4({ doStream }) } }),
      } as unknown as ProviderRegistry,
    });
    const res = await app.request('/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        input: 'hi',
        stream: true,
        temperature: 0.4,
        top_k: 20,
        stop: ['STOP'],
        previous_response_id: 'resp_prev',
        service_tier: 'flex',
      }),
    });
    expect(res.status).toBe(200);
    const call = doStream.mock.calls[0][0] as Record<string, unknown> & { providerOptions?: Record<string, unknown> };
    expect(call).toMatchObject({ temperature: 0.4, topK: 20, stopSequences: ['STOP'] });
    expect(call.providerOptions).toMatchObject({
      openai: { previousResponseId: 'resp_prev', serviceTier: 'flex' },
    });
  });

  it('gates previous_response_id off non-openai providers in the streaming path', async () => {
    const doStream = streamModel();
    const app = createApp({
      registry: {
        anthropic: new MockProviderV4({ languageModels: { 'claude-sonnet-4': new MockLanguageModelV4({ doStream }) } }),
      } as unknown as ProviderRegistry,
    });
    const res = await app.request('/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4',
        input: 'hi',
        stream: true,
        previous_response_id: 'resp_prev',
      }),
    });
    expect(res.status).toBe(200);
    const call = doStream.mock.calls[0][0] as { providerOptions?: Record<string, unknown> };
    expect(call.providerOptions ?? {}).toEqual({});
  });

  it('echoes previous_response_id into the streamed response envelope regardless of provider gating', async () => {
    const doStream = streamModel();
    const app = createApp({
      registry: {
        openai: new MockProviderV4({ languageModels: { 'gpt-4o-mini': new MockLanguageModelV4({ doStream }) } }),
      } as unknown as ProviderRegistry,
    });
    const res = await app.request('/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        input: 'hi',
        stream: true,
        previous_response_id: 'resp_prev',
      }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"previous_response_id":"resp_prev"');
  });
});
