import { describe, expect, test } from 'vitest';
import type { TextStreamPart, ToolSet } from 'ai';
import { createOpenAIStreamTransform, type OpenAIStreamChunk } from './stream.js';

async function collectChunks(
  parts: TextStreamPart<ToolSet>[],
  model = 'gpt-4',
  opts?: { includeUsage?: boolean },
): Promise<OpenAIStreamChunk[]> {
  const transform = createOpenAIStreamTransform({ model, ...opts });
  const reader = new ReadableStream<TextStreamPart<ToolSet>>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  })
    .pipeThrough(transform)
    .getReader();

  const frames: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    frames.push(value);
  }

  return frames.filter((f) => f !== 'data: [DONE]\n\n').map((f) => JSON.parse(f.replace('data: ', '').trim()));
}

describe('createOpenAIStreamTransform', () => {
  test('text-delta emits role on first chunk only', async () => {
    const chunks = await collectChunks([
      { type: 'text-delta', text: 'Hello' } as TextStreamPart<ToolSet>,
      { type: 'text-delta', text: ' world' } as TextStreamPart<ToolSet>,
    ]);

    expect(chunks[0].choices[0].delta.role).toBe('assistant');
    expect(chunks[0].choices[0].delta.content).toBe('Hello');
    expect(chunks[1].choices[0].delta.role).toBeUndefined();
    expect(chunks[1].choices[0].delta.content).toBe(' world');
  });

  test('reasoning-delta emits reasoning_content', async () => {
    const chunks = await collectChunks([
      {
        type: 'reasoning-delta',
        text: 'Thinking...',
      } as TextStreamPart<ToolSet>,
    ]);

    expect(chunks[0].choices[0].delta.reasoning_content).toBe('Thinking...');
    expect(chunks[0].choices[0].delta.role).toBe('assistant');
  });

  test('reasoning-delta emits reasoning_details with signature', async () => {
    const chunks = await collectChunks([
      {
        type: 'reasoning-delta',
        id: 'r-0',
        text: 'Thinking...',
        providerMetadata: { anthropic: { signature: 'sig-abc' } },
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    const detail = chunks[0].choices[0].delta.reasoning_details![0];
    expect(detail).toMatchObject({
      type: 'reasoning.text',
      id: 'r-0',
      index: 0,
      text: 'Thinking...',
      signature: 'sig-abc',
    });
  });

  test('reasoning-delta emits reasoning.encrypted for redacted data', async () => {
    const chunks = await collectChunks([
      {
        type: 'reasoning-delta',
        id: 'r-0',
        text: '',
        providerMetadata: { anthropic: { redactedData: 'redacted-blob' } },
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    const detail = chunks[0].choices[0].delta.reasoning_details![0];
    expect(detail).toMatchObject({
      type: 'reasoning.encrypted',
      id: 'r-0',
      index: 0,
      data: 'redacted-blob',
    });
  });

  test('reasoning-delta reuses stable index per block id', async () => {
    const chunks = await collectChunks([
      {
        type: 'reasoning-delta',
        id: 'r-0',
        text: 'a',
        providerMetadata: { anthropic: { signature: 's0' } },
      } as unknown as TextStreamPart<ToolSet>,
      {
        type: 'reasoning-delta',
        id: 'r-0',
        text: 'b',
        providerMetadata: { anthropic: { signature: 's0' } },
      } as unknown as TextStreamPart<ToolSet>,
      {
        type: 'reasoning-delta',
        id: 'r-1',
        text: 'c',
        providerMetadata: { anthropic: { signature: 's1' } },
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    expect(chunks[0].choices[0].delta.reasoning_details![0].index).toBe(0);
    expect(chunks[1].choices[0].delta.reasoning_details![0].index).toBe(0);
    expect(chunks[2].choices[0].delta.reasoning_details![0].index).toBe(1);
  });

  test('tool-input-start + tool-input-delta produces incremental tool_calls', async () => {
    const chunks = await collectChunks([
      {
        type: 'tool-input-start',
        id: 'call_1',
        toolName: 'get_weather',
      } as unknown as TextStreamPart<ToolSet>,
      {
        type: 'tool-input-delta',
        id: 'call_1',
        delta: '{"city"',
      } as unknown as TextStreamPart<ToolSet>,
      {
        type: 'tool-input-delta',
        id: 'call_1',
        delta: ':"NYC"}',
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    // First chunk: tool-input-start
    const tc0 = chunks[0].choices[0].delta.tool_calls![0];
    expect(tc0.index).toBe(0);
    expect(tc0.id).toBe('call_1');
    expect(tc0.type).toBe('function');
    expect(tc0.function!.name).toBe('get_weather');
    expect(tc0.function!.arguments).toBe('');

    // Second chunk: tool-input-delta
    const tc1 = chunks[1].choices[0].delta.tool_calls![0];
    expect(tc1.index).toBe(0);
    expect(tc1.function!.arguments).toBe('{"city"');

    // Third chunk
    const tc2 = chunks[2].choices[0].delta.tool_calls![0];
    expect(tc2.function!.arguments).toBe(':"NYC"}');
  });

  test('multiple tool calls get incrementing indices', async () => {
    const chunks = await collectChunks([
      {
        type: 'tool-input-start',
        id: 'call_1',
        toolName: 'tool_a',
      } as unknown as TextStreamPart<ToolSet>,
      {
        type: 'tool-input-start',
        id: 'call_2',
        toolName: 'tool_b',
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    expect(chunks[0].choices[0].delta.tool_calls![0].index).toBe(0);
    expect(chunks[1].choices[0].delta.tool_calls![0].index).toBe(1);
  });

  test('finish-step emits usage and finish_reason', async () => {
    const chunks = await collectChunks([
      { type: 'text-delta', text: 'Hi' } as TextStreamPart<ToolSet>,
      {
        type: 'finish-step',
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        response: {
          id: 'resp-1',
          modelId: 'gpt-4',
          timestamp: new Date('2024-01-01'),
        },
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    const finishChunk = chunks[1];
    expect(finishChunk.choices[0].finish_reason).toBe('stop');
    expect(finishChunk.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
  });

  test('include_usage: true emits usage:null on deltas + a dedicated empty-choices usage chunk', async () => {
    const chunks = await collectChunks(
      [
        { type: 'text-delta', text: 'Hi' } as TextStreamPart<ToolSet>,
        {
          type: 'finish-step',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          response: {
            id: 'resp-1',
            modelId: 'gpt-4',
            timestamp: new Date('2024-01-01'),
          },
        } as unknown as TextStreamPart<ToolSet>,
      ],
      'gpt-4',
      { includeUsage: true },
    );

    expect(chunks).toHaveLength(3);
    // Text-delta and finish chunk both carry an explicit usage: null.
    expect(chunks[0].usage).toBeNull();
    expect(chunks[0].choices[0].delta.content).toBe('Hi');
    expect(chunks[1].usage).toBeNull();
    expect(chunks[1].choices[0].finish_reason).toBe('stop');
    // Dedicated final chunk: empty choices, populated usage, shared id/model.
    const usageChunk = chunks[2];
    expect(usageChunk.choices).toEqual([]);
    expect(usageChunk.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
    expect(usageChunk.id).toBe(chunks[0].id);
    expect(usageChunk.model).toBe(chunks[0].model);
  });

  test('include_usage absent: usage on finish chunk only, no null stubs, no dedicated chunk', async () => {
    const chunks = await collectChunks([
      { type: 'text-delta', text: 'Hi' } as TextStreamPart<ToolSet>,
      {
        type: 'finish-step',
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        response: {
          id: 'resp-1',
          modelId: 'gpt-4',
          timestamp: new Date('2024-01-01'),
        },
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    expect(chunks).toHaveLength(2);
    // No null stub on the delta chunk (legacy wire shape).
    expect(chunks[0].usage).toBeUndefined();
    // Usage populated on the finish chunk.
    expect(chunks[1].usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
    // No dedicated empty-choices chunk.
    expect(chunks.some((c) => c.choices.length === 0)).toBe(false);
  });

  test('raw chunk peeks service_tier and system_fingerprint', async () => {
    const chunks = await collectChunks([
      {
        type: 'raw',
        rawType: 'response-metadata',
        rawValue: { service_tier: 'auto', system_fingerprint: 'fp-abc123' },
      } as unknown as TextStreamPart<ToolSet>,
      { type: 'text-delta', text: 'Hi' } as TextStreamPart<ToolSet>,
    ]);

    // raw chunk produces no output frame
    expect(chunks).toHaveLength(1);
    // But subsequent chunks carry system_fingerprint
    expect(chunks[0].system_fingerprint).toBe('fp-abc123');
  });

  test('raw refusal chunk emits refusal delta and preserves finish_reason', async () => {
    const chunks = await collectChunks([
      {
        type: 'raw',
        rawType: 'response-metadata',
        rawValue: {
          choices: [{ delta: { refusal: 'I cannot help with that.' } }],
        },
      } as unknown as TextStreamPart<ToolSet>,
      {
        type: 'finish-step',
        finishReason: 'stop',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
        response: { id: 'resp-2', modelId: 'gpt-4' },
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    // Refusal delta emitted
    expect(chunks[0].choices[0].delta.refusal).toBe('I cannot help with that.');
    // G54: refusal is orthogonal to finish_reason — upstream 'stop' passes through
    expect(chunks[1].choices[0].finish_reason).toBe('stop');
  });

  test('translator does not emit [DONE] frame (owned by SSE wrapper)', async () => {
    const transform = createOpenAIStreamTransform({ model: 'gpt-4' });
    const reader = new ReadableStream<TextStreamPart<ToolSet>>({
      start(controller) {
        controller.enqueue({
          type: 'text-delta',
          text: 'Hi',
        } as TextStreamPart<ToolSet>);
        controller.close();
      },
    })
      .pipeThrough(transform)
      .getReader();

    const frames: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      frames.push(value);
    }

    expect(frames.find((f) => f === 'data: [DONE]\n\n')).toBeUndefined();
  });

  test('error part emits error object in chunk', async () => {
    const chunks = await collectChunks([
      {
        type: 'error',
        error: new Error('upstream failed'),
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    expect(chunks[0].error?.message).toBe('upstream failed');
    expect(chunks[0].error?.type).toBe('server_error');
  });
});
