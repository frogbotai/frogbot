// Tests for the chat-completions `response_format` → AI SDK `Output` mapping
// (`toChatOutput`). The AI SDK resolves `output.responseFormat` into the
// LanguageModelV4CallOptions `responseFormat` key, so each case asserts the
// resolved responseFormat value.

import { describe, expect, test } from 'vitest';

import { toChatOutput } from './output.js';

describe('toChatOutput', () => {
  test('absent response_format maps to undefined (default text mode)', () => {
    expect(toChatOutput(undefined)).toBeUndefined();
    expect(toChatOutput(null)).toBeUndefined();
  });

  test('{type: text} maps to undefined (default text mode)', () => {
    expect(toChatOutput({ type: 'text' })).toBeUndefined();
  });

  test('{type: json_object} maps to responseFormat {type: json}', async () => {
    const output = toChatOutput({ type: 'json_object' });
    expect(output).toBeDefined();
    await expect(output?.responseFormat).resolves.toEqual({ type: 'json' });
  });

  test('{type: json_schema} maps to responseFormat {type: json, schema, name, description}', async () => {
    const schema = {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
      additionalProperties: false,
    };
    const output = toChatOutput({
      type: 'json_schema',
      json_schema: { name: 'weather', description: 'A weather report', schema },
    });
    expect(output).toBeDefined();
    await expect(output?.responseFormat).resolves.toEqual({
      type: 'json',
      schema,
      name: 'weather',
      description: 'A weather report',
    });
  });

  test('json_schema without a schema object throws a 400 pointed at the field', () => {
    let caught: unknown;
    try {
      toChatOutput({ type: 'json_schema', json_schema: { name: 'weather' } });
    } catch (e) {
      caught = e;
    }
    const err = caught as { status?: number; param?: string };
    expect(err.status).toBe(400);
    expect(err.param).toBe('response_format.json_schema.schema');
  });

  test('unknown response_format type throws a 400 pointed at the field', () => {
    let caught: unknown;
    try {
      toChatOutput({ type: 'banana' });
    } catch (e) {
      caught = e;
    }
    const err = caught as { status?: number; param?: string };
    expect(err.status).toBe(400);
    expect(err.param).toBe('response_format.type');
  });
});
