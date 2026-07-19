import { afterEach, describe, expect, it, vi } from 'vitest';

import { toResponseStatus, toResponsesResponse } from './toResponse.js';

const baseResponse = { timestamp: new Date('2026-07-03T00:00:00.000Z') };
const baseUsage = { inputTokens: 3, outputTokens: 2, totalTokens: 5 };

describe('toResponsesResponse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps AI SDK generateText output to Responses shape', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('response-id').mockReturnValueOnce('message-id');

    expect(toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      previousResponseId: 'resp_prev',
      result: {
        text: 'hello frog',
        finishReason: 'stop',
        response: baseResponse,
        usage: baseUsage,
      },
    })).toEqual({
      id: 'resp_response-id',
      object: 'response',
      created_at: 1783036800,
      completed_at: 1783036800,
      status: 'completed',
      error: null,
      incomplete_details: null,
      model: 'openai/gpt-4o-mini',
      previous_response_id: 'resp_prev',
      parallel_tool_calls: true,
      tools: [],
      tool_choice: 'auto',
      temperature: null,
      top_p: null,
      max_output_tokens: null,
      instructions: null,
      store: true,
      truncation: 'disabled',
      text: { format: { type: 'text' } },
      reasoning: { effort: null, summary: null },
      user: null,
      metadata: null,
      input: [],
      output: [{
        id: 'msg_message-id',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'hello frog', annotations: [] }],
      }],
      output_text: 'hello frog',
      usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
    });
  });

  it('emits function_call output items from tool calls', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('fc-id' as `${string}-${string}-${string}-${string}-${string}`);

    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: {
        text: '',
        finishReason: 'tool-calls',
        toolCalls: [{ toolCallId: 'call_1', toolName: 'get_weather', input: { city: 'Paris' } }],
        response: { id: 'resp_x', timestamp: new Date('2026-07-03T00:00:00.000Z') },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      },
    });

    expect(result.output).toEqual([{
      id: 'fc_fc-id',
      type: 'function_call',
      status: 'completed',
      call_id: 'call_1',
      name: 'get_weather',
      arguments: JSON.stringify({ city: 'Paris' }),
    }]);
    expect(result.output_text).toBe('');
  });

  it('maps status "completed" for stop finishReason', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: { text: 'ok', finishReason: 'stop', response: baseResponse, usage: baseUsage },
    });
    expect(result.status).toBe('completed');
    expect(result.incomplete_details).toBeNull();
  });

  it('maps status "completed" for tool-calls finishReason', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: {
        text: '',
        finishReason: 'tool-calls',
        toolCalls: [{ toolCallId: 'c1', toolName: 't', input: {} }],
        response: baseResponse,
        usage: baseUsage,
      },
    });
    expect(result.status).toBe('completed');
    expect(result.incomplete_details).toBeNull();
  });

  it('maps status "incomplete" with max_output_tokens for length finishReason', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: { text: 'partial', finishReason: 'length', response: baseResponse, usage: baseUsage },
    });
    expect(result.status).toBe('incomplete');
    expect(result.incomplete_details).toEqual({ reason: 'max_output_tokens' });
  });

  it('maps status "incomplete" with content_filter for content-filter finishReason', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: { text: '', finishReason: 'content-filter', response: baseResponse, usage: baseUsage },
    });
    expect(result.status).toBe('incomplete');
    expect(result.incomplete_details).toEqual({ reason: 'content_filter' });
  });

  it('maps status "failed" for error finishReason', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: { text: '', finishReason: 'error', response: baseResponse, usage: baseUsage },
    });
    expect(result.status).toBe('failed');
    expect(result.incomplete_details).toBeNull();
  });

  it('maps status "failed" for other finishReason', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: { text: '', finishReason: 'other', response: baseResponse, usage: baseUsage },
    });
    expect(result.status).toBe('failed');
    expect(result.incomplete_details).toBeNull();
  });

  it('includes input_tokens_details.cached_tokens when cacheReadTokens is set', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: {
        text: 'ok',
        finishReason: 'stop',
        response: baseResponse,
        usage: { ...baseUsage, inputTokenDetails: { cacheReadTokens: 12 } },
      },
    });
    expect(result.usage.input_tokens_details).toEqual({ cached_tokens: 12 });
  });

  it('includes output_tokens_details.reasoning_tokens when reasoningTokens is set', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: {
        text: 'ok',
        finishReason: 'stop',
        response: baseResponse,
        usage: { ...baseUsage, outputTokenDetails: { reasoningTokens: 7 } },
      },
    });
    expect(result.usage.output_tokens_details).toEqual({ reasoning_tokens: 7 });
  });

  it('omits *_details when token details are undefined', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: { text: 'ok', finishReason: 'stop', response: baseResponse, usage: baseUsage },
    });
    expect(result.usage).not.toHaveProperty('input_tokens_details');
    expect(result.usage).not.toHaveProperty('output_tokens_details');
  });

  it('sets completed_at when status is completed', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: { text: 'ok', finishReason: 'stop', response: baseResponse, usage: baseUsage },
    });
    expect(result.completed_at).toBe(result.created_at);
  });

  it('sets completed_at null when status is incomplete or failed', () => {
    for (const finishReason of ['length', 'content-filter', 'error', 'other'] as const) {
      const result = toResponsesResponse({
        model: 'openai/gpt-4o-mini',
        result: { text: '', finishReason, response: baseResponse, usage: baseUsage },
      });
      expect(result.completed_at).toBeNull();
    }
  });

  it('emits reasoning output items from result.content', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('response-id' as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce('reasoning-id' as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce('message-id' as `${string}-${string}-${string}-${string}-${string}`);

    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: {
        text: 'answer',
        finishReason: 'stop',
        content: [
          { type: 'reasoning', text: 'thinking hard' },
          { type: 'text', text: 'answer' },
        ],
        response: baseResponse,
        usage: baseUsage,
      },
    });

    expect(result.output[0]).toEqual({
      id: 'rs_reasoning-id',
      type: 'reasoning',
      status: 'completed',
      summary: [{ type: 'summary_text', text: 'thinking hard' }],
    });
    expect(result.output[1]).toMatchObject({ type: 'message' });
  });

  it('emits a message item with empty output_text for an empty response', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: { text: '', finishReason: 'stop', response: baseResponse, usage: baseUsage },
    });
    expect(result.output).toHaveLength(1);
    expect(result.output[0]).toMatchObject({
      type: 'message',
      content: [{ type: 'output_text', text: '', annotations: [] }],
    });
  });

  it('echoes parallel_tool_calls from the request body', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      body: { parallel_tool_calls: false },
      result: { text: 'ok', finishReason: 'stop', response: baseResponse, usage: baseUsage },
    });
    expect(result.parallel_tool_calls).toBe(false);
  });

  it('defaults parallel_tool_calls to true when absent from the request', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: { text: 'ok', finishReason: 'stop', response: baseResponse, usage: baseUsage },
    });
    expect(result.parallel_tool_calls).toBe(true);
  });

  it('always emits spec-required echo fields with defaults when the body is absent', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: { text: 'ok', finishReason: 'stop', response: baseResponse, usage: baseUsage },
    });
    expect(result).toMatchObject({
      parallel_tool_calls: true,
      tools: [],
      tool_choice: 'auto',
      temperature: null,
      top_p: null,
      max_output_tokens: null,
      instructions: null,
      store: true,
      truncation: 'disabled',
      text: { format: { type: 'text' } },
      reasoning: { effort: null, summary: null },
      user: null,
      metadata: null,
      input: [],
    });
  });

  it('echoes request-provided echo fields when present', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      body: {
        tools: [{ type: 'function', name: 'get_weather' }],
        tool_choice: 'required',
        temperature: 0.5,
        top_p: 0.9,
        max_output_tokens: 1024,
        instructions: 'be terse',
        store: false,
        truncation: 'auto',
        text: { format: { type: 'json_object' } },
        reasoning: { effort: 'high', summary: 'auto' },
        user: 'u1',
        metadata: { k: 'v' },
      },
      result: { text: 'ok', finishReason: 'stop', response: baseResponse, usage: baseUsage },
    });
    expect(result).toMatchObject({
      tools: [{ type: 'function', name: 'get_weather' }],
      tool_choice: 'required',
      temperature: 0.5,
      top_p: 0.9,
      max_output_tokens: 1024,
      instructions: 'be terse',
      store: false,
      truncation: 'auto',
      text: { format: { type: 'json_object' } },
      reasoning: { effort: 'high', summary: 'auto' },
      user: 'u1',
      metadata: { k: 'v' },
    });
  });

  it('sets service_tier from provider metadata', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: {
        text: 'ok',
        finishReason: 'stop',
        response: baseResponse,
        usage: baseUsage,
        providerMetadata: { openai: { service_tier: 'scale' } },
      },
    });
    expect(result.service_tier).toBe('scale');
  });

  it('omits service_tier when provider metadata has none', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: { text: 'ok', finishReason: 'stop', response: baseResponse, usage: baseUsage },
    });
    expect(result).not.toHaveProperty('service_tier');
  });

  it('sets error to null for completed and incomplete statuses', () => {
    for (const finishReason of ['stop', 'tool-calls', 'length', 'content-filter'] as const) {
      const result = toResponsesResponse({
        model: 'openai/gpt-4o-mini',
        result: { text: 'ok', finishReason, response: baseResponse, usage: baseUsage },
      });
      expect(result.error).toBeNull();
    }
  });

  it('sets a server_error error object when finishReason is error', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: { text: '', finishReason: 'error', response: baseResponse, usage: baseUsage },
    });
    expect(result.error).toEqual({ code: 'server_error', message: expect.any(String) });
  });

  it('sets a server_error error object when finishReason is other', () => {
    const result = toResponsesResponse({
      model: 'openai/gpt-4o-mini',
      result: { text: '', finishReason: 'other', response: baseResponse, usage: baseUsage },
    });
    expect(result.error).toEqual({ code: 'server_error', message: expect.any(String) });
  });
});

describe('toResponseStatus', () => {
  it.each([
    ['stop', 'completed', null],
    ['tool-calls', 'completed', null],
    ['length', 'incomplete', { reason: 'max_output_tokens' }],
    ['content-filter', 'incomplete', { reason: 'content_filter' }],
    ['error', 'failed', null],
    ['other', 'failed', null],
  ] as const)('maps %s → %s', (finishReason, status, incompleteDetails) => {
    expect(toResponseStatus(finishReason)).toEqual({ status, incompleteDetails });
  });
});
