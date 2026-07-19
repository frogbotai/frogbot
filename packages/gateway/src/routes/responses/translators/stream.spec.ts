import type { TextStreamPart, ToolSet } from 'ai';
import { describe, expect, it } from 'vitest';

import { createResponsesStreamTransform } from './stream.js';

async function collectEvents(parts: TextStreamPart<ToolSet>[]) {
  const reader = new ReadableStream<TextStreamPart<ToolSet>>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  })
    .pipeThrough(
      createResponsesStreamTransform({
        model: 'openai/gpt-4o',
        previousResponseId: 'resp_prev',
      }),
    )
    .getReader();

  const events: Array<{ event: string; data: any }> = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) return events;
    const event = value.match(/^event: (.+)$/m)?.[1];
    const data = value.match(/^data: (.+)$/m)?.[1];
    if (event && data) {
      events.push({ event, data: JSON.parse(data) });
    }
  }
}

function finishStep(finishReason: string, extra: Record<string, unknown> = {}): TextStreamPart<ToolSet> {
  return {
    type: 'finish-step',
    finishReason,
    usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    response: {
      id: 'resp_test',
      modelId: 'gpt-4o',
      timestamp: new Date('2026-07-03T00:00:00.000Z'),
    },
    ...extra,
  } as unknown as TextStreamPart<ToolSet>;
}

describe('createResponsesStreamTransform', () => {
  it('emits Responses SSE lifecycle events for text', async () => {
    const events = await collectEvents([
      { type: 'text-delta', text: 'hello' } as TextStreamPart<ToolSet>,
      { type: 'text-delta', text: ' frog' } as TextStreamPart<ToolSet>,
      finishStep('stop'),
    ]);

    expect(events.map((event) => event.event)).toEqual([
      'response.created',
      'response.in_progress',
      'response.output_item.added',
      'response.content_part.added',
      'response.output_text.delta',
      'response.output_text.delta',
      'response.output_text.done',
      'response.content_part.done',
      'response.output_item.done',
      'response.completed',
    ]);
    expect(events[4].data.delta).toBe('hello');
    expect(events[7].data).toMatchObject({
      type: 'response.content_part.done',
      item_id: events[3].data.item_id,
      content_index: 0,
      part: { type: 'output_text', text: 'hello frog', annotations: [] },
    });
    expect(events[9].data.response).toMatchObject({
      id: events[0].data.response.id,
      status: 'completed',
      output_text: 'hello frog',
      previous_response_id: 'resp_prev',
      usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
    });
    // G7: the synthetic response id is frozen at construction and never
    // adopts the upstream finish-step id — stable created → completed.
    expect(events[0].data.response.id).toMatch(/^resp_/);
    expect(events[9].data.response.id).not.toBe('resp_test');
  });

  it('assigns a monotonically increasing sequence_number to every event', async () => {
    const events = await collectEvents([
      { type: 'text-delta', text: 'hello' } as TextStreamPart<ToolSet>,
      finishStep('stop'),
    ]);

    const sequences = events.map((event) => event.data.sequence_number);
    expect(sequences[0]).toBe(0);
    expect(sequences).toEqual(sequences.map((_, index) => index));
    for (const event of events) {
      expect(typeof event.data.sequence_number).toBe('number');
    }
  });

  it('emits response.in_progress immediately after response.created', async () => {
    const events = await collectEvents([
      { type: 'text-delta', text: 'hi' } as TextStreamPart<ToolSet>,
      finishStep('stop'),
    ]);

    expect(events[0].event).toBe('response.created');
    expect(events[0].data.sequence_number).toBe(0);
    expect(events[1].event).toBe('response.in_progress');
    expect(events[1].data.sequence_number).toBe(1);
    expect(events[1].data.response.status).toBe('in_progress');
  });

  it('emits function_call lifecycle events for streamed tool calls', async () => {
    const events = await collectEvents([
      {
        type: 'tool-input-start',
        id: 'call_1',
        toolName: 'get_weather',
      },
      {
        type: 'tool-input-delta',
        id: 'call_1',
        delta: '{"city":',
      },
      {
        type: 'tool-input-delta',
        id: 'call_1',
        delta: '"Paris"}',
      },
      { type: 'tool-input-end', id: 'call_1' },
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'get_weather',
        input: { city: 'Paris' },
      } as unknown as TextStreamPart<ToolSet>,
      finishStep('tool-calls', {
        response: {
          id: 'resp_tc',
          modelId: 'gpt-4o',
          timestamp: new Date('2026-07-03T00:00:00.000Z'),
        },
      }),
    ]);

    expect(events.map((event) => event.event)).toEqual([
      'response.created',
      'response.in_progress',
      'response.output_item.added',
      'response.function_call_arguments.delta',
      'response.function_call_arguments.delta',
      'response.function_call_arguments.done',
      'response.output_item.done',
      'response.completed',
    ]);
    const added = events[2].data;
    expect(added.item).toMatchObject({
      type: 'function_call',
      call_id: 'call_1',
      name: 'get_weather',
      status: 'in_progress',
    });
    expect(events[5].data.arguments).toBe('{"city":"Paris"}');
    expect(events[6].data.item).toMatchObject({
      type: 'function_call',
      status: 'completed',
      arguments: '{"city":"Paris"}',
    });
    expect(events[7].data.response.output).toEqual([
      {
        id: added.item.id,
        type: 'function_call',
        status: 'completed',
        call_id: 'call_1',
        name: 'get_weather',
        arguments: '{"city":"Paris"}',
      },
    ]);
    const sequences = events.map((event) => event.data.sequence_number);
    expect(sequences).toEqual(sequences.map((_, index) => index));
  });

  it('synthesizes function_call events when only tool-call is emitted', async () => {
    const events = await collectEvents([
      {
        type: 'tool-call',
        toolCallId: 'call_2',
        toolName: 'lookup',
        input: { q: 'frog' },
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    expect(events.map((event) => event.event)).toEqual([
      'response.created',
      'response.in_progress',
      'response.output_item.added',
      'response.function_call_arguments.done',
      'response.output_item.done',
      'response.completed',
    ]);
    expect(events[4].data.item).toMatchObject({
      type: 'function_call',
      call_id: 'call_2',
      name: 'lookup',
      arguments: '{"q":"frog"}',
    });
  });

  it('emits the reasoning item lifecycle with correct event names', async () => {
    const events = await collectEvents([
      { type: 'reasoning-start', id: 'r1' },
      {
        type: 'reasoning-delta',
        id: 'r1',
        text: 'thinking',
        providerMetadata: { anthropic: { signature: 'sig_123' } },
      } as unknown as TextStreamPart<ToolSet>,
      { type: 'reasoning-end', id: 'r1' },
      { type: 'text-delta', text: 'answer' } as TextStreamPart<ToolSet>,
      finishStep('stop'),
    ]);

    expect(events.map((event) => event.event)).toEqual([
      'response.created',
      'response.in_progress',
      'response.output_item.added',
      'response.reasoning_summary_part.added',
      'response.reasoning_summary_text.delta',
      'response.reasoning_summary_text.done',
      'response.reasoning_summary_part.done',
      'response.output_item.done',
      'response.output_item.added',
      'response.content_part.added',
      'response.output_text.delta',
      'response.output_text.done',
      'response.content_part.done',
      'response.output_item.done',
      'response.completed',
    ]);
    expect(events[2].data.item).toMatchObject({
      type: 'reasoning',
      status: 'in_progress',
    });
    expect(events[4].data).toMatchObject({ delta: 'thinking' });
    expect(events[4].data.reasoningEncryptedContent).toBeUndefined();
    expect(events[5].data.text).toBe('thinking');
    const completed = events[events.length - 1].data.response.output;
    expect(completed[0]).toMatchObject({
      type: 'reasoning',
      status: 'completed',
      summary: [{ type: 'summary_text', text: 'thinking' }],
    });
    expect(completed[0].content).toBeUndefined();
    expect(completed[1]).toMatchObject({
      type: 'message',
      status: 'completed',
    });
  });

  it('terminates with response.completed on finish reason stop', async () => {
    const events = await collectEvents([
      { type: 'text-delta', text: 'hi' } as TextStreamPart<ToolSet>,
      finishStep('stop'),
    ]);

    const terminal = events[events.length - 1];
    expect(terminal.event).toBe('response.completed');
    expect(terminal.data.response.status).toBe('completed');
  });

  it('terminates with response.incomplete on finish reason length', async () => {
    const events = await collectEvents([
      { type: 'text-delta', text: 'hi' } as TextStreamPart<ToolSet>,
      finishStep('length'),
    ]);

    const terminal = events[events.length - 1];
    expect(terminal.event).toBe('response.incomplete');
    expect(terminal.data.response).toMatchObject({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
    });
  });

  it('terminates with response.incomplete and content_filter reason on content-filter', async () => {
    const events = await collectEvents([
      { type: 'text-delta', text: 'hi' } as TextStreamPart<ToolSet>,
      finishStep('content-filter'),
    ]);

    const terminal = events[events.length - 1];
    expect(terminal.event).toBe('response.incomplete');
    expect(terminal.data.response.incomplete_details).toEqual({
      reason: 'content_filter',
    });
  });

  it('terminates with response.failed on finish reason error', async () => {
    const events = await collectEvents([
      { type: 'text-delta', text: 'hi' } as TextStreamPart<ToolSet>,
      finishStep('error'),
    ]);

    const terminal = events[events.length - 1];
    expect(terminal.event).toBe('response.failed');
    expect(terminal.data.response).toMatchObject({
      status: 'failed',
      usage: null,
    });
    expect(terminal.data.response.error).toBeDefined();
  });

  it('surfaces a mid-stream error part as response.failed with error detail', async () => {
    const events = await collectEvents([
      { type: 'text-delta', text: 'hi' } as TextStreamPart<ToolSet>,
      {
        type: 'error',
        error: Object.assign(new Error('boom'), { statusCode: 500 }),
      } as unknown as TextStreamPart<ToolSet>,
    ]);

    expect(events.some((event) => event.event === 'error')).toBe(true);
    const terminal = events[events.length - 1];
    expect(terminal.event).toBe('response.failed');
    expect(terminal.data.response.error.message).toBe('boom');
  });
});
