// Tests for the Anthropic /v1/messages inbound parser (`toModelMessages`).
//
// Mirrors the coverage pattern of the OpenAI chat-completions barrel suite
// (chatCompletions/translators/chatCompletions.spec.ts). Exercises the full
// inversion of `convertToAnthropicPrompt`: system flattening, user/tool run
// splitting, multimodal ingestion, tool_use_id correlation, cache_control
// forwarding, and assistant block handling.

import { describe, expect, test } from 'vitest';

import { UnsupportedModalityError } from '../../../../errors/gatewayError.js';
import type { AnthropicMessage } from '../types.js';

import { toModelMessages } from './index.js';

// ---------------------------------------------------------------------------
// system parameter
// ---------------------------------------------------------------------------

describe('system parameter', () => {
  test('returns no system message when system is absent', () => {
    const result = toModelMessages({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result).toEqual([{ role: 'user', content: 'hi' }]);
  });

  test('forwards string system as a single system message', () => {
    const result = toModelMessages({
      messages: [{ role: 'user', content: 'hi' }],
      system: 'You are helpful.',
    });
    expect(result[0]).toEqual({ role: 'system', content: 'You are helpful.' });
  });

  test('flattens array-form system into one message per block', () => {
    const result = toModelMessages({
      messages: [{ role: 'user', content: 'hi' }],
      system: [
        { type: 'text', text: 'block one' },
        { type: 'text', text: 'block two' },
      ],
    });
    expect(result.slice(0, 2)).toEqual([
      { role: 'system', content: 'block one' },
      { role: 'system', content: 'block two' },
    ]);
  });

  test('forwards cache_control on system blocks to providerOptions', () => {
    const result = toModelMessages({
      messages: [{ role: 'user', content: 'hi' }],
      system: [{ type: 'text', text: 'cached', cache_control: { type: 'ephemeral' } }],
    });
    expect(result[0]).toEqual({
      role: 'system',
      content: 'cached',
      providerOptions: { unknown: { cache_control: { type: 'ephemeral' } } },
    });
  });
});

// ---------------------------------------------------------------------------
// user messages
// ---------------------------------------------------------------------------

describe('user messages', () => {
  test('passes through string content unchanged', () => {
    const result = toModelMessages({ messages: [{ role: 'user', content: 'Hello' }] });
    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  test('parses text blocks into text parts', () => {
    const result = toModelMessages({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'part' }] }],
    });
    expect(result).toEqual([{ role: 'user', content: [{ type: 'text', text: 'part' }] }]);
  });

  test('forwards cache_control on text blocks to providerOptions', () => {
    const result = toModelMessages({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'part', cache_control: { type: 'ephemeral' } }] },
      ],
    });
    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'part',
            providerOptions: { unknown: { cache_control: { type: 'ephemeral' } } },
          },
        ],
      },
    ]);
  });

  test('parses base64 image blocks into file parts', () => {
    const result = toModelMessages({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
          ],
        },
      ],
    });
    expect(result).toEqual([
      {
        role: 'user',
        content: [{ type: 'file', mediaType: 'image/png', data: { type: 'data', data: 'AAAA' } }],
      },
    ]);
  });

  test('parses url image blocks into file parts with a URL', () => {
    const result = toModelMessages({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: 'https://example.com/x.png' } },
          ],
        },
      ],
    });
    const part = (result[0].content as Array<Record<string, unknown>>)[0];
    expect(part.type).toBe('file');
    expect(part.mediaType).toBe('image');
    expect((part.data as { type: string; url: URL }).url.href).toBe('https://example.com/x.png');
  });

  test('parses inline text document into a text file part', () => {
    const result = toModelMessages({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'text', media_type: 'text/plain', data: 'file body' },
              title: 'notes',
              context: 'ctx',
              citations: { enabled: true },
            },
          ],
        },
      ],
    });
    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'text/plain',
            data: { type: 'text', text: 'file body' },
            providerOptions: {
              anthropic: { title: 'notes', context: 'ctx', citations: { enabled: true } },
            },
          },
        ],
      },
    ]);
  });

  test('parses base64 document into a pdf file part', () => {
    const result = toModelMessages({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBER' } },
          ],
        },
      ],
    });
    expect(result).toEqual([
      {
        role: 'user',
        content: [{ type: 'file', mediaType: 'application/pdf', data: { type: 'data', data: 'JVBER' } }],
      },
    ]);
  });

  test('throws UnsupportedModalityError for unknown user block types', () => {
    expect(() =>
      toModelMessages({
        messages: [
          { role: 'user', content: [{ type: 'video' } as unknown as never] } as AnthropicMessage,
        ],
      }),
    ).toThrow(UnsupportedModalityError);
  });

  test('returns empty-string user message when content array yields no parts', () => {
    const result = toModelMessages({
      messages: [{ role: 'user', content: [] as unknown as never }],
    });
    expect(result).toEqual([{ role: 'user', content: '' }]);
  });
});

// ---------------------------------------------------------------------------
// tool_result splitting and correlation
// ---------------------------------------------------------------------------

describe('tool_result handling', () => {
  test('splits mixed content into contiguous user/tool/user runs', () => {
    const result = toModelMessages({
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'call_1', name: 'get_weather', input: {} }],
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Q: ' },
            { type: 'tool_result', tool_use_id: 'call_1', content: 'A' },
            { type: 'text', text: ' follow-up' },
          ],
        },
      ],
    });

    expect(result).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'call_1', toolName: 'get_weather', input: {} }],
      },
      { role: 'user', content: [{ type: 'text', text: 'Q: ' }] },
      {
        role: 'tool',
        content: [{ type: 'tool-result', toolCallId: 'call_1', toolName: 'get_weather', output: { type: 'text', value: 'A' } }],
      },
      { role: 'user', content: [{ type: 'text', text: ' follow-up' }] },
    ]);
  });

  test('correlates tool_use_id to the tool name from a prior assistant tool_use', () => {
    const result = toModelMessages({
      messages: [
        { role: 'assistant', content: [{ type: 'tool_use', id: 'call_9', name: 'lookup', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_9', content: 'ok' }] },
      ],
    });
    const toolMsg = result.find((m) => m.role === 'tool');
    expect((toolMsg?.content as Array<{ toolName: string }>)[0].toolName).toBe('lookup');
  });

  test('falls back to empty tool name when tool_use_id is unknown', () => {
    const result = toModelMessages({
      messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'orphan', content: 'x' }] }],
    });
    const toolMsg = result.find((m) => m.role === 'tool');
    expect((toolMsg?.content as Array<{ toolName: string }>)[0].toolName).toBe('');
  });

  test('preserves JSON structure in string tool_result content', () => {
    const result = toModelMessages({
      messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c', content: '{"a":1}' }] }],
    });
    const toolMsg = result.find((m) => m.role === 'tool');
    expect((toolMsg?.content as Array<{ output: unknown }>)[0].output).toEqual({
      type: 'json',
      value: { a: 1 },
    });
  });

  test('maps null tool_result content to empty text output', () => {
    const result = toModelMessages({
      messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c' }] }],
    });
    const toolMsg = result.find((m) => m.role === 'tool');
    expect((toolMsg?.content as Array<{ output: unknown }>)[0].output).toEqual({ type: 'text', value: '' });
  });

  test('maps array tool_result content into text/image content parts', () => {
    const result = toModelMessages({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'c',
              content: [
                { type: 'text', text: 'summary' },
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'IMG' } },
              ],
            },
          ],
        },
      ],
    });
    const toolMsg = result.find((m) => m.role === 'tool');
    expect((toolMsg?.content as Array<{ output: unknown }>)[0].output).toEqual({
      type: 'content',
      value: [
        { type: 'text', text: 'summary' },
        { type: 'image-data', data: 'IMG', mediaType: 'image/png' },
      ],
    });
  });

  test('forwards cache_control on tool_result to providerOptions', () => {
    const result = toModelMessages({
      messages: [
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'c', content: 'x', cache_control: { type: 'ephemeral' } }],
        },
      ],
    });
    const toolMsg = result.find((m) => m.role === 'tool');
    expect((toolMsg?.content as Array<{ providerOptions: unknown }>)[0].providerOptions).toEqual({
      unknown: { cache_control: { type: 'ephemeral' } },
    });
  });
});

// ---------------------------------------------------------------------------
// assistant messages
// ---------------------------------------------------------------------------

describe('assistant messages', () => {
  test('passes through string content unchanged', () => {
    const result = toModelMessages({
      messages: [{ role: 'assistant', content: 'sure' }],
    });
    expect(result).toEqual([{ role: 'assistant', content: 'sure' }]);
  });

  test('collapses a lone text block to string content', () => {
    const result = toModelMessages({
      messages: [{ role: 'assistant', content: [{ type: 'text', text: 'answer' }] }],
    });
    expect(result).toEqual([{ role: 'assistant', content: 'answer' }]);
  });

  test('keeps array form when a lone text block carries cache_control', () => {
    const result = toModelMessages({
      messages: [
        { role: 'assistant', content: [{ type: 'text', text: 'answer', cache_control: { type: 'ephemeral' } }] },
      ],
    });
    expect(result).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'answer', providerOptions: { unknown: { cache_control: { type: 'ephemeral' } } } },
        ],
      },
    ]);
  });

  test('maps thinking blocks to reasoning parts with signature', () => {
    const result = toModelMessages({
      messages: [
        { role: 'assistant', content: [{ type: 'thinking', thinking: 'hmm', signature: 'sig' }] },
      ],
    });
    expect(result).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'reasoning', text: 'hmm', providerOptions: { unknown: { signature: 'sig' } } }],
      },
    ]);
  });

  test('maps redacted_thinking blocks to reasoning parts with redactedData', () => {
    const result = toModelMessages({
      messages: [
        { role: 'assistant', content: [{ type: 'redacted_thinking', data: 'REDACTED' }] },
      ],
    });
    expect(result).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'reasoning', text: '', providerOptions: { unknown: { redactedData: 'REDACTED' } } }],
      },
    ]);
  });

  test('maps tool_use blocks to tool-call parts', () => {
    const result = toModelMessages({
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'call_1', name: 'search', input: { q: 'x' } }],
        },
      ],
    });
    expect(result).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'call_1', toolName: 'search', input: { q: 'x' } }],
      },
    ]);
  });

  test('drops unknown assistant block types', () => {
    const result = toModelMessages({
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'kept' },
            { type: 'server_tool_use' } as unknown as never,
          ],
        },
      ],
    });
    expect(result).toEqual([{ role: 'assistant', content: 'kept' }]);
  });
});
