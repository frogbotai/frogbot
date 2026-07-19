import { describe, expect, test } from 'vitest';
import { parseAssistantMessage } from './toModelMessages/assistant.js';
import type { OpenAIAssistantMessage } from './types.js';

describe('reasoning_details inverse (wire → AI SDK)', () => {
  test('reasoning.text with signature converts to reasoning part with providerOptions.unknown', () => {
    const msg: OpenAIAssistantMessage = {
      role: 'assistant',
      content: 'The result is 42.',
      reasoning_details: [
        {
          type: 'reasoning.text',
          id: 'reasoning-1',
          index: 0,
          text: 'Thinking hard...',
          signature: 'sig-xyz',
          format: 'unknown',
        },
      ],
    };

    const result = parseAssistantMessage(msg, 0);
    expect(Array.isArray(result.content)).toBe(true);
    const content = result.content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({
      type: 'reasoning',
      text: 'Thinking hard...',
      providerOptions: { unknown: { signature: 'sig-xyz' } },
    });
    expect(content[1]).toEqual({
      type: 'text',
      text: 'The result is 42.',
    });
  });

  test('reasoning.encrypted converts to reasoning part with providerOptions.unknown.redactedData', () => {
    const msg: OpenAIAssistantMessage = {
      role: 'assistant',
      content: 'Hello',
      reasoning_details: [
        {
          type: 'reasoning.encrypted',
          id: 'reasoning-2',
          index: 0,
          data: 'secret-data',
          format: 'unknown',
        },
      ],
    };

    const result = parseAssistantMessage(msg, 0);
    const content = result.content as Array<Record<string, unknown>>;
    expect(content[0]).toEqual({
      type: 'reasoning',
      text: '',
      providerOptions: { unknown: { redactedData: 'secret-data' } },
    });
  });

  test('reasoning.text without signature omits providerOptions', () => {
    const msg: OpenAIAssistantMessage = {
      role: 'assistant',
      content: 'Answer',
      reasoning_details: [
        {
          type: 'reasoning.text',
          id: 'reasoning-3',
          index: 0,
          text: 'Simple thought',
        },
      ],
    };

    const result = parseAssistantMessage(msg, 0);
    const content = result.content as Array<Record<string, unknown>>;
    expect(content[0]).toEqual({
      type: 'reasoning',
      text: 'Simple thought',
      providerOptions: undefined,
    });
  });

  test('multiple reasoning_details preserve order', () => {
    const msg: OpenAIAssistantMessage = {
      role: 'assistant',
      content: 'Final',
      reasoning_details: [
        { type: 'reasoning.text', id: 'r1', index: 0, text: 'Step 1', signature: 'sig-1' },
        { type: 'reasoning.encrypted', id: 'r2', index: 1, data: 'encrypted-step-2' },
        { type: 'reasoning.text', id: 'r3', index: 2, text: 'Step 3' },
      ],
    };

    const result = parseAssistantMessage(msg, 0);
    const content = result.content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(4); // 3 reasoning + 1 text
    expect(content[0]).toMatchObject({ type: 'reasoning', text: 'Step 1' });
    expect(content[1]).toMatchObject({ type: 'reasoning', text: '', providerOptions: { unknown: { redactedData: 'encrypted-step-2' } } });
    expect(content[2]).toMatchObject({ type: 'reasoning', text: 'Step 3' });
    expect(content[3]).toEqual({ type: 'text', text: 'Final' });
  });
});
