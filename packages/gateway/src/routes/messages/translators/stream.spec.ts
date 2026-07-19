import { describe, expect, test } from 'vitest';
import type { TextStreamPart, ToolSet } from 'ai';

import { createAnthropicStreamTransform } from './stream.js';

type AnthropicEvent = { event: string; data: any };

async function collectEvents(parts: TextStreamPart<ToolSet>[]): Promise<AnthropicEvent[]> {
  const reader = new ReadableStream<TextStreamPart<ToolSet>>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  })
    .pipeThrough(createAnthropicStreamTransform({ model: 'claude-test' }))
    .getReader();

  const frames: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    frames.push(value);
  }

  return frames.map((frame) => {
    const event = frame.match(/^event: (.+)$/m)?.[1];
    const data = frame.match(/^data: (.+)$/m)?.[1];
    if (!event || !data) {
      throw new Error(`Malformed frame: ${frame}`);
    }
    return { event, data: JSON.parse(data) };
  });
}

describe('createAnthropicStreamTransform', () => {
  test('emits Anthropic event ordering and block indices', async () => {
    const events = await collectEvents([
      { type: 'reasoning-start' } as TextStreamPart<ToolSet>,
      { type: 'reasoning-delta', text: 'think' } as TextStreamPart<ToolSet>,
      { type: 'reasoning-end' } as TextStreamPart<ToolSet>,
      { type: 'text-start', id: 'text-0' },
      { type: 'text-delta', id: 'text-0', text: 'hello' },
      { type: 'text-end', id: 'text-0' },
      {
        type: 'finish',
        finishReason: 'stop',
        totalUsage: { outputTokens: 2 },
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    expect(events.map((e) => e.event)).toEqual([
      'message_start',
      'ping',
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
      'message_delta',
      'message_stop',
    ]);
    expect(events[2].data.index).toBe(0);
    expect(events[5].data.index).toBe(1);
    expect(events[8].data.delta.stop_reason).toBe('end_turn');
  });

  test('emits signature_delta before thinking_delta for reasoning metadata', async () => {
    const events = await collectEvents([
      { type: 'reasoning-start' } as TextStreamPart<ToolSet>,
      {
        type: 'reasoning-delta',
        text: 'think',
        providerMetadata: { anthropic: { signature: 'sig-123' } },
      } as unknown as TextStreamPart<ToolSet>,
      { type: 'reasoning-end' } as TextStreamPart<ToolSet>,
    ]);

    const deltas = events.filter((e) => e.event === 'content_block_delta').map((e) => e.data.delta);
    expect(deltas).toEqual([
      { type: 'signature_delta', signature: 'sig-123' },
      { type: 'thinking_delta', thinking: 'think' },
    ]);
  });

  test('expands non-streaming tool_use into start, input delta, and stop', async () => {
    const events = await collectEvents([
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'get_weather',
        input: { city: 'SF' },
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    expect(events.map((e) => e.event)).toEqual([
      'message_start',
      'ping',
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
    ]);
    expect(events[2].data.content_block).toEqual({
      type: 'tool_use',
      id: 'call_1',
      name: 'get_weather',
      input: {},
    });
    expect(events[3].data.delta).toEqual({
      type: 'input_json_delta',
      partial_json: '{"city":"SF"}',
    });
  });

  test('maps stop reasons', async () => {
    const finishReasons = [
      ['stop', 'end_turn'],
      ['length', 'max_tokens'],
      ['tool-calls', 'tool_use'],
      ['content-filter', 'refusal'],
    ] as const;

    for (const [finishReason, stopReason] of finishReasons) {
      const events = await collectEvents([
        {
          type: 'finish',
          finishReason,
          totalUsage: { outputTokens: 1 },
        } as unknown as TextStreamPart<ToolSet>,
      ]);
      expect(events.find((e) => e.event === 'message_delta')?.data.delta.stop_reason).toBe(stopReason);
    }
  });

  test('emits matched stop_sequence in message_delta (G60)', async () => {
    const events = await collectEvents([
      { type: 'text-start', id: 'text-0' },
      { type: 'text-delta', id: 'text-0', text: 'hello' },
      { type: 'text-end', id: 'text-0' },
      {
        type: 'finish-step',
        response: {},
        providerMetadata: { anthropic: { stopSequence: 'STOP' } },
      } as unknown as TextStreamPart<ToolSet>,
      {
        type: 'finish',
        finishReason: 'stop',
        rawFinishReason: 'stop_sequence',
        totalUsage: { outputTokens: 1 },
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    const delta = events.find((e) => e.event === 'message_delta')?.data.delta;
    expect(delta).toEqual({
      stop_reason: 'stop_sequence',
      stop_sequence: 'STOP',
    });
  });

  test('emits usage detail fields in message_delta from finish-step raw usage (G62)', async () => {
    const events = await collectEvents([
      { type: 'text-start', id: 'text-0' },
      { type: 'text-delta', id: 'text-0', text: 'hello' },
      { type: 'text-end', id: 'text-0' },
      {
        type: 'finish-step',
        response: {},
        usage: {
          raw: {
            input_tokens: 8,
            output_tokens: 15,
            cache_creation: {
              ephemeral_5m_input_tokens: 148,
              ephemeral_1h_input_tokens: 100,
            },
            output_tokens_details: { thinking_tokens: 5 },
            service_tier: 'standard',
          },
        },
      } as unknown as TextStreamPart<ToolSet>,
      {
        type: 'finish',
        finishReason: 'stop',
        totalUsage: { inputTokens: 10, outputTokens: 15 },
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    const usage = events.find((e) => e.event === 'message_delta')?.data.usage;
    expect(usage).toEqual({
      input_tokens: 10,
      output_tokens: 15,
      service_tier: 'standard',
      output_tokens_details: { thinking_tokens: 5 },
      cache_creation: {
        ephemeral_5m_input_tokens: 148,
        ephemeral_1h_input_tokens: 100,
      },
    });
  });

  test('omits usage detail fields in message_delta when raw usage has none (G62)', async () => {
    const events = await collectEvents([
      {
        type: 'finish',
        finishReason: 'stop',
        totalUsage: { outputTokens: 2 },
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    const usage = events.find((e) => e.event === 'message_delta')?.data.usage;
    expect(usage).not.toHaveProperty('output_tokens_details');
    expect(usage).not.toHaveProperty('cache_creation');
  });

  test('error parts close open blocks and emit Anthropic error event', async () => {
    const events = await collectEvents([
      { type: 'text-start', id: 'text-0' },
      { type: 'text-delta', id: 'text-0', text: 'hello' },
      {
        type: 'error',
        error: Object.assign(new Error('rate limited'), { statusCode: 429 }),
      } as unknown as TextStreamPart<ToolSet>,
      { type: 'text-delta', id: 'text-0', text: 'ignored' },
    ]);

    expect(events.map((e) => e.event)).toEqual([
      'message_start',
      'ping',
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
      'error',
      'message_stop',
    ]);
    expect(events[5].data.error).toEqual({
      type: 'rate_limit_error',
      message: 'rate limited',
    });
  });
});
