import { describe, expect, test } from 'vitest';
import { toOpenAIResponse } from './toOpenAIResponse.js';

const baseArgs = {
  text: 'Hello',
  finishReason: 'stop',
  usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  response: { id: 'resp-1', modelId: 'gpt-4', timestamp: new Date('2024-01-01') },
  model: 'gpt-4',
};

describe('toOpenAIResponse', () => {
  describe('usage with cached token details', () => {
    test('includes prompt_tokens_details when cache tokens present', () => {
      const result = toOpenAIResponse({
        ...baseArgs,
        usage: {
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
          inputTokenDetails: { cacheReadTokens: 60, cacheWriteTokens: 10 },
        },
      });

      expect(result.usage.prompt_tokens_details).toEqual({
        cached_tokens: 60,
        cache_write_tokens: 10,
      });
    });

    test('includes completion_tokens_details when reasoning tokens present', () => {
      const result = toOpenAIResponse({
        ...baseArgs,
        usage: {
          promptTokens: 50,
          completionTokens: 30,
          totalTokens: 80,
          outputTokenDetails: { reasoningTokens: 15 },
        },
      });

      expect(result.usage.completion_tokens_details).toEqual({
        reasoning_tokens: 15,
      });
    });

    test('omits detail fields when not provided', () => {
      const result = toOpenAIResponse(baseArgs);
      expect(result.usage.prompt_tokens_details).toBeUndefined();
      expect(result.usage.completion_tokens_details).toBeUndefined();
    });
  });

  describe('tool call normalization', () => {
    test('normalizes invalid tool names', () => {
      const result = toOpenAIResponse({
        ...baseArgs,
        finishReason: 'tool-calls',
        toolCalls: [{ toolCallId: 'call_1', toolName: 'bad. Tool- name1!@', args: {} }],
      });

      expect(result.choices[0].message.tool_calls![0].function.name).toBe('bad._Tool-_name1__');
    });

    test('strips top-level empty-string keys from object args', () => {
      const result = toOpenAIResponse({
        ...baseArgs,
        finishReason: 'tool-calls',
        toolCalls: [{
          toolCallId: 'call_1',
          toolName: 'my_tool',
          args: { '': {}, city: 'San Francisco', nested: { '': {}, country: 'US' } },
        }],
      });

      const parsed = JSON.parse(result.choices[0].message.tool_calls![0].function.arguments);
      expect(parsed['']).toBeUndefined();
      expect(parsed.city).toBe('San Francisco');
      expect(parsed.nested['']).toEqual({});
    });

    test('passes through string args unchanged', () => {
      const raw = '{"":"{}","city":"SF"}';
      const result = toOpenAIResponse({
        ...baseArgs,
        finishReason: 'tool-calls',
        toolCalls: [{ toolCallId: 'call_1', toolName: 'my_tool', args: raw }],
      });

      expect(result.choices[0].message.tool_calls![0].function.arguments).toBe(raw);
    });

    test('truncates tool names longer than 128 chars', () => {
      const result = toOpenAIResponse({
        ...baseArgs,
        finishReason: 'tool-calls',
        toolCalls: [{ toolCallId: 'call_1', toolName: 'a'.repeat(200), args: {} }],
      });

      expect(result.choices[0].message.tool_calls![0].function.name).toHaveLength(128);
    });
  });

  describe('finish reason mapping', () => {
    test('maps tool-calls to tool_calls', () => {
      const result = toOpenAIResponse({ ...baseArgs, finishReason: 'tool-calls' });
      expect(result.choices[0].finish_reason).toBe('tool_calls');
    });

    test('maps content-filter to content_filter', () => {
      const result = toOpenAIResponse({ ...baseArgs, finishReason: 'content-filter' });
      expect(result.choices[0].finish_reason).toBe('content_filter');
    });

    test('defaults unknown reasons to stop', () => {
      const result = toOpenAIResponse({ ...baseArgs, finishReason: 'unknown-reason' });
      expect(result.choices[0].finish_reason).toBe('stop');
    });
  });

  describe('service_tier', () => {
    test('sets service_tier when provided', () => {
      const result = toOpenAIResponse({ ...baseArgs, serviceTier: 'flex' });
      expect(result.service_tier).toBe('flex');
    });

    test('omits service_tier when not provided', () => {
      const result = toOpenAIResponse(baseArgs);
      expect(result).not.toHaveProperty('service_tier');
    });
  });

  describe('refusal (G59)', () => {
    test('lifts refusal from raw response body into message', () => {
      const result = toOpenAIResponse({
        ...baseArgs,
        text: '',
        response: {
          ...baseArgs.response,
          body: {
            choices: [{
              index: 0,
              message: { role: 'assistant', content: null, refusal: 'I cannot help with that.' },
              finish_reason: 'stop',
            }],
          },
        },
      });

      expect(result.choices[0].message.refusal).toBe('I cannot help with that.');
      expect(result.choices[0].message.content).toBeNull();
    });

    test('omits refusal when body has refusal: null', () => {
      const result = toOpenAIResponse({
        ...baseArgs,
        response: {
          ...baseArgs.response,
          body: {
            choices: [{ index: 0, message: { role: 'assistant', content: 'hi', refusal: null }, finish_reason: 'stop' }],
          },
        },
      });

      expect(result.choices[0].message).not.toHaveProperty('refusal');
    });

    test('filters empty-string refusal', () => {
      const result = toOpenAIResponse({
        ...baseArgs,
        response: {
          ...baseArgs.response,
          body: {
            choices: [{ index: 0, message: { role: 'assistant', content: 'hi', refusal: '' }, finish_reason: 'stop' }],
          },
        },
      });

      expect(result.choices[0].message).not.toHaveProperty('refusal');
    });

    test('omits refusal when body is missing or malformed', () => {
      expect(toOpenAIResponse(baseArgs).choices[0].message).not.toHaveProperty('refusal');
      expect(
        toOpenAIResponse({ ...baseArgs, response: { ...baseArgs.response, body: 'not json' } })
          .choices[0].message,
      ).not.toHaveProperty('refusal');
      expect(
        toOpenAIResponse({ ...baseArgs, response: { ...baseArgs.response, body: { choices: [] } } })
          .choices[0].message,
      ).not.toHaveProperty('refusal');
      expect(
        toOpenAIResponse({ ...baseArgs, response: { ...baseArgs.response, body: { choices: [{ message: null }] } } })
          .choices[0].message,
      ).not.toHaveProperty('refusal');
    });

    test('emits both content and refusal when both present', () => {
      const result = toOpenAIResponse({
        ...baseArgs,
        text: 'Partial answer.',
        response: {
          ...baseArgs.response,
          body: {
            choices: [{
              index: 0,
              message: { role: 'assistant', content: 'Partial answer.', refusal: 'Then I refused.' },
              finish_reason: 'stop',
            }],
          },
        },
      });

      expect(result.choices[0].message.content).toBe('Partial answer.');
      expect(result.choices[0].message.refusal).toBe('Then I refused.');
    });
  });
});
