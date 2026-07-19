// Tests for the Anthropic /v1/messages response translator
// (AI SDK generate result → Anthropic wire envelope).

import { describe, expect, test } from 'vitest';

import { mapStopReason, toAnthropicResponse } from './toAnthropicResponse.js';

const baseArgs = {
  text: '',
  finishReason: 'stop',
  usage: { inputTokens: 1, outputTokens: 2 },
  response: { id: 'msg_123', modelId: 'claude-opus' },
  model: 'claude-opus',
};

describe('toAnthropicResponse', () => {
  test('builds a text content block from result text', () => {
    const result = toAnthropicResponse({ ...baseArgs, text: 'hello' });
    expect(result.content).toEqual([{ type: 'text', text: 'hello' }]);
    expect(result.type).toBe('message');
    expect(result.role).toBe('assistant');
  });

  test('uses response id and modelId when present', () => {
    const result = toAnthropicResponse({ ...baseArgs, text: 'hi' });
    expect(result.id).toBe('msg_123');
    expect(result.model).toBe('claude-opus');
  });

  test('generates a msg_ id when response id is missing', () => {
    const result = toAnthropicResponse({ ...baseArgs, text: 'hi', response: {} });
    expect(result.id).toMatch(/^msg_[a-f0-9]{24}$/);
    expect(result.model).toBe('claude-opus');
  });

  test('emits non-empty content when there is no text or tools', () => {
    const result = toAnthropicResponse({ ...baseArgs });
    expect(result.content).toEqual([{ type: 'text', text: '' }]);
  });

  test('orders content as thinking → text → tool_use', () => {
    const result = toAnthropicResponse({
      ...baseArgs,
      text: 'answer',
      reasoning: [{ text: 'ponder', signature: 'sig' }],
      toolCalls: [{ toolCallId: 'call_1', toolName: 'search', args: { q: 'x' } }],
    });
    expect(result.content).toEqual([
      { type: 'thinking', thinking: 'ponder', signature: 'sig' },
      { type: 'text', text: 'answer' },
      { type: 'tool_use', id: 'call_1', name: 'search', input: { q: 'x' } },
    ]);
  });

  test('emits redacted_thinking when reasoning has redactedData', () => {
    const result = toAnthropicResponse({
      ...baseArgs,
      reasoning: [{ text: '', redactedData: 'REDACTED' }],
    });
    expect(result.content).toEqual([{ type: 'redacted_thinking', data: 'REDACTED' }]);
  });

  test('defaults thinking signature to empty string', () => {
    const result = toAnthropicResponse({ ...baseArgs, reasoning: [{ text: 'x' }] });
    expect(result.content).toEqual([{ type: 'thinking', thinking: 'x', signature: '' }]);
  });

  test('parses stringified tool call args into an object', () => {
    const result = toAnthropicResponse({
      ...baseArgs,
      toolCalls: [{ toolCallId: 'c', toolName: 't', args: '{"n":5}' }],
    });
    expect(result.content).toEqual([{ type: 'tool_use', id: 'c', name: 't', input: { n: 5 } }]);
  });

  test('preserves unparsable tool call args string', () => {
    const result = toAnthropicResponse({
      ...baseArgs,
      toolCalls: [{ toolCallId: 'c', toolName: 't', args: 'not json' }],
    });
    expect(result.content).toEqual([{ type: 'tool_use', id: 'c', name: 't', input: 'not json' }]);
  });

  test('maps finishReason to stop_reason and forwards stop_sequence', () => {
    const result = toAnthropicResponse({ ...baseArgs, text: 'x', finishReason: 'tool-calls', stopSequence: 'STOP' });
    expect(result.stop_reason).toBe('tool_use');
    expect(result.stop_sequence).toBe('STOP');
  });

  test('defaults stop_sequence to null', () => {
    const result = toAnthropicResponse({ ...baseArgs, text: 'x' });
    expect(result.stop_sequence).toBeNull();
  });

  test('emits base usage tokens', () => {
    const result = toAnthropicResponse({ ...baseArgs, text: 'x', usage: { inputTokens: 8, outputTokens: 15 } });
    expect(result.usage.input_tokens).toBe(8);
    expect(result.usage.output_tokens).toBe(15);
  });

  test('includes cache usage fields when present', () => {
    const result = toAnthropicResponse({
      ...baseArgs,
      text: 'x',
      usage: {
        inputTokens: 8,
        outputTokens: 15,
        cacheCreationInputTokens: 100,
        cacheReadInputTokens: 50,
        serviceTier: 'standard',
      },
    });
    expect(result.usage).toMatchObject({
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 50,
      service_tier: 'standard',
    });
  });

  test('omits cache usage fields when absent', () => {
    const result = toAnthropicResponse({ ...baseArgs, text: 'x' });
    expect(result.usage).not.toHaveProperty('cache_creation_input_tokens');
    expect(result.usage).not.toHaveProperty('cache_read_input_tokens');
    expect(result.usage).not.toHaveProperty('service_tier');
  });

  test('emits usage detail fields for thinking tokens and cache creation breakdown', () => {
    const result = toAnthropicResponse({
      ...baseArgs,
      text: 'x',
      usage: {
        inputTokens: 8,
        outputTokens: 15,
        thinkingTokens: 5,
        cacheCreation: { ephemeral5mInputTokens: 148, ephemeral1hInputTokens: 100 },
      },
    });
    expect(result.usage.output_tokens_details).toEqual({ thinking_tokens: 5 });
    expect(result.usage.cache_creation).toEqual({
      ephemeral_5m_input_tokens: 148,
      ephemeral_1h_input_tokens: 100,
    });
  });
});

describe('mapStopReason', () => {
  test.each([
    ['stop', 'end_turn'],
    ['tool-calls', 'tool_use'],
    ['length', 'max_tokens'],
    ['content-filter', 'refusal'],
    ['error', 'end_turn'],
    ['other', 'end_turn'],
    ['unknown-thing', 'end_turn'],
  ])('maps unified finish reason %s → %s', (reason, expected) => {
    expect(mapStopReason(reason)).toBe(expected);
  });

  test('emits raw Anthropic wire literal verbatim when known', () => {
    expect(mapStopReason('stop', 'stop_sequence')).toBe('stop_sequence');
    expect(mapStopReason('stop', 'pause_turn')).toBe('pause_turn');
  });

  test('ignores unknown raw reason and falls back to unified mapping', () => {
    expect(mapStopReason('stop', 'made_up')).toBe('end_turn');
  });
});
