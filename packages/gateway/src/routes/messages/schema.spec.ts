// Tests for the Anthropic /v1/messages request schema validation.

import { describe, expect, test } from 'vitest';

import { RequestValidationError } from '../../errors/gatewayError.js';

import { parseMessagesRequest } from './schema.js';

const valid = {
  model: 'claude-opus',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'hi' }],
};

describe('parseMessagesRequest — required fields', () => {
  test('accepts a minimal valid request', () => {
    expect(parseMessagesRequest(valid)).toMatchObject({
      model: 'claude-opus',
      max_tokens: 1024,
    });
  });

  test('rejects missing model', () => {
    expect(() => parseMessagesRequest({ ...valid, model: undefined })).toThrow(RequestValidationError);
  });

  test('rejects empty model', () => {
    expect(() => parseMessagesRequest({ ...valid, model: '' })).toThrow(/model is required/);
  });

  test('rejects missing max_tokens', () => {
    expect(() => parseMessagesRequest({ ...valid, max_tokens: undefined })).toThrow(RequestValidationError);
  });

  test('rejects non-positive max_tokens', () => {
    expect(() => parseMessagesRequest({ ...valid, max_tokens: 0 })).toThrow(/positive integer/);
  });

  test('rejects an empty messages array', () => {
    expect(() => parseMessagesRequest({ ...valid, messages: [] })).toThrow(/at least one message/);
  });
});

describe('parseMessagesRequest — content blocks', () => {
  test('accepts an array of user content blocks', () => {
    const result = parseMessagesRequest({
      ...valid,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hi' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
          ],
        },
      ],
    });
    expect(Array.isArray(result.messages[0].content)).toBe(true);
  });

  test('rejects an empty content block array', () => {
    expect(() =>
      parseMessagesRequest({ ...valid, messages: [{ role: 'user', content: [] }] }),
    ).toThrow(RequestValidationError);
  });

  // NOTE: empty tool_use_id / tool_use id+name do NOT throw at the schema
  // level — the discriminated-variant min(1) check fails, but the forward-compat
  // `unknownUserBlockSchema`/`unknownAssistantBlockSchema` catch-all (which only
  // requires `type: string`) accepts the block. Correlation is handled leniently
  // in the translator (empty tool name fallback). The min(1) messages in schema.ts
  // are therefore only reachable when the block is not otherwise catch-all valid.
  test('accepts empty tool_result.tool_use_id via the catch-all', () => {
    const result = parseMessagesRequest({
      ...valid,
      messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: '' }] }],
    });
    expect((result.messages[0].content as Array<{ type: string }>)[0].type).toBe('tool_result');
  });

  test('accepts empty tool_use id/name via the catch-all', () => {
    const result = parseMessagesRequest({
      ...valid,
      messages: [{ role: 'assistant', content: [{ type: 'tool_use', id: '', name: 'x', input: {} }] }],
    });
    expect((result.messages[0].content as Array<{ type: string }>)[0].type).toBe('tool_use');
  });

  test('passes unknown content block types through the catch-all', () => {
    const result = parseMessagesRequest({
      ...valid,
      messages: [{ role: 'user', content: [{ type: 'future_block', extra: 1 }] }],
    });
    expect((result.messages[0].content as Array<{ type: string }>)[0].type).toBe('future_block');
  });
});

describe('parseMessagesRequest — cache_control & system', () => {
  test('accepts ephemeral cache_control with ttl', () => {
    const result = parseMessagesRequest({
      ...valid,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi', cache_control: { type: 'ephemeral', ttl: '1h' } }] }],
    });
    expect(result.messages).toHaveLength(1);
  });

  test('accepts string-form system', () => {
    const result = parseMessagesRequest({ ...valid, system: 'You are helpful.' });
    expect(result.system).toBe('You are helpful.');
  });

  test('accepts array-form system', () => {
    const result = parseMessagesRequest({
      ...valid,
      system: [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }],
    });
    expect(Array.isArray(result.system)).toBe(true);
  });

  test('rejects an empty array-form system', () => {
    expect(() => parseMessagesRequest({ ...valid, system: [] })).toThrow(RequestValidationError);
  });
});

describe('parseMessagesRequest — tools & optional params', () => {
  test('accepts tool definitions', () => {
    const result = parseMessagesRequest({
      ...valid,
      tools: [{ name: 'search', description: 'find', input_schema: { type: 'object' } }],
    });
    expect(result.tools).toHaveLength(1);
  });

  test('rejects tool with an empty name', () => {
    expect(() => parseMessagesRequest({ ...valid, tools: [{ name: '' }] })).toThrow(RequestValidationError);
  });

  test('preserves unknown top-level fields via .loose()', () => {
    const result = parseMessagesRequest({ ...valid, some_future_field: 'kept' }) as Record<string, unknown>;
    expect(result.some_future_field).toBe('kept');
  });

  test('reports the dotted path of the failing field', () => {
    try {
      parseMessagesRequest({ ...valid, max_tokens: 0 });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RequestValidationError);
      expect((err as RequestValidationError).param).toBe('max_tokens');
    }
  });
});
