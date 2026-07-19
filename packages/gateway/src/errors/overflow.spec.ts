import { describe, expect, it } from 'vitest';

import { CONTEXT_OVERFLOW_ENVELOPE, isContextOverflow } from './overflow.js';

describe('isContextOverflow — provider message patterns', () => {
  it.each([
    ['Anthropic', 'prompt is too long: 250000 tokens > 200000 maximum'],
    ['Bedrock', 'Input is too long for requested model'],
    ['OpenAI', "This model's maximum context length is 8192 tokens, however you requested 10000."],
    ['OpenAI Responses', 'Your conversation exceeds the context window of this model.'],
    ['Gemini', 'input token count of 50000 exceeds the maximum of 32000'],
    ['Grok', 'maximum prompt length is 131072 tokens'],
    ['Groq', 'Please reduce the length of the messages or completion.'],
    ['OpenRouter / DeepSeek', "This model's maximum context length is 65536 tokens."],
    ['GitHub Copilot', 'request exceeds the limit of 16384 tokens'],
    ['LM Studio', 'Trying to keep first 8192 tokens when context window is greater than the context length'],
    ['MiniMax', 'context window exceeds limit'],
    ['Kimi/Moonshot', 'exceeded model token limit'],
    ['vLLM (alt)', 'context length is only 8192 tokens'],
    ['Ollama', 'prompt too long; exceeded max context length'],
    ['Mistral', 'too large for model with 32768 maximum context length'],
    ['z.ai', 'finish_reason: model_context_window_exceeded'],
    ['generic', 'context_length_exceeded'],
    ['HTTP 413 phrase', 'Request Entity Too Large'],
  ])('%s pattern matches', (_, message) => {
    expect(isContextOverflow({ message })).toBe(true);
  });
});

describe('isContextOverflow — status & body signals', () => {
  it('treats HTTP 413 as overflow regardless of message', () => {
    expect(isContextOverflow({ status: 413, message: '' })).toBe(true);
    expect(isContextOverflow({ status: 413, message: 'Payload Too Large' })).toBe(true);
  });

  it('detects body.error.code === "context_length_exceeded"', () => {
    expect(
      isContextOverflow({
        message: 'BadRequestError: 400',
        body: { error: { code: 'context_length_exceeded' } },
      }),
    ).toBe(true);
  });

  it('detects body.error.code === "model_context_window_exceeded"', () => {
    expect(
      isContextOverflow({
        message: 'something',
        body: { error: { code: 'model_context_window_exceeded' } },
      }),
    ).toBe(true);
  });

  it('detects Cerebras/Mistral empty-body 400/413 message format', () => {
    expect(isContextOverflow({ message: '400 status code (no body)' })).toBe(true);
    expect(isContextOverflow({ message: '413 (no body)' })).toBe(true);
  });

  it('does NOT match unrelated 4xx empty-body errors', () => {
    expect(isContextOverflow({ message: '401 (no body)' })).toBe(false);
    expect(isContextOverflow({ message: '404 status code (no body)' })).toBe(false);
  });

  it('does NOT match unrelated messages', () => {
    expect(isContextOverflow({ message: 'Invalid API key' })).toBe(false);
    expect(isContextOverflow({ message: 'rate limit exceeded' })).toBe(false);
    expect(isContextOverflow({ message: '' })).toBe(false);
  });

  it('handles undefined inputs gracefully', () => {
    expect(isContextOverflow({})).toBe(false);
  });
});

describe('CONTEXT_OVERFLOW_ENVELOPE — canonical shape', () => {
  it('has the canonical OpenAI shape', () => {
    expect(CONTEXT_OVERFLOW_ENVELOPE).toEqual({
      status: 400,
      code: 'context_length_exceeded',
      type: 'invalid_request_error',
      param: 'messages',
    });
  });
});
