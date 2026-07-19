import { afterEach, describe, expect, it, vi } from 'vitest';

import { serializeSseFrame } from './sseFrame.js';
import { createSseResponse, toSseStream } from './toSseStream.js';

function streamFrom(chunks: string[]): ReadableStream<string> {
  let i = 0;
  return new ReadableStream<string>({
    pull(c) {
      if (i < chunks.length) {
        c.enqueue(chunks[i++]);
      } else {
        c.close();
      }
    },
  });
}

async function collect(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    out += value;
  }
  return out;
}

describe('sseFrame.serializeSseFrame', () => {
  it('serializes data frames', () => {
    expect(serializeSseFrame({ kind: 'data', data: { hello: 1 } })).toBe('data: {"hello":1}\n\n');
  });
  it('serializes named event frames', () => {
    expect(
      serializeSseFrame({
        kind: 'event',
        event: 'message_start',
        data: { x: 1 },
      }),
    ).toBe('event: message_start\ndata: {"x":1}\n\n');
  });
  it('serializes comment frames', () => {
    expect(serializeSseFrame({ kind: 'comment', text: 'heartbeat' })).toBe(': heartbeat\n\n');
  });
  it('serializes the [DONE] sentinel', () => {
    expect(serializeSseFrame({ kind: 'done' })).toBe('data: [DONE]\n\n');
  });
});

describe('toSseStream', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes inner chunks through and appends [DONE] when requested', async () => {
    const wrapped = toSseStream(streamFrom(['data: a\n\n', 'data: b\n\n']), {
      appendDone: true,
      keepAliveMs: 0,
    });
    expect(await collect(wrapped)).toBe('data: a\n\ndata: b\n\ndata: [DONE]\n\n');
  });

  it('does not append [DONE] when disabled (Anthropic mode)', async () => {
    const wrapped = toSseStream(streamFrom(['event: message_stop\ndata: {}\n\n']), {
      appendDone: false,
      keepAliveMs: 0,
    });
    expect(await collect(wrapped)).toBe('event: message_stop\ndata: {}\n\n');
  });

  it('maps stream-time errors via toError', async () => {
    const errStream = new ReadableStream<string>({
      pull(c) {
        c.error(new Error('boom'));
      },
    });
    const wrapped = toSseStream(errStream, {
      appendDone: true,
      keepAliveMs: 0,
      toError: (e) => [
        {
          kind: 'data',
          data: { error: { message: (e as Error).message } },
        },
      ],
    });
    const out = await collect(wrapped);
    expect(out).toContain('"boom"');
    expect(out.endsWith('data: [DONE]\n\n')).toBe(true);
  });

  it('surfaces reader errors when no mapper is configured', async () => {
    const errStream = new ReadableStream<string>({
      pull(c) {
        c.error(new Error('boom'));
      },
    });
    const wrapped = toSseStream(errStream, {
      appendDone: true,
      keepAliveMs: 0,
    });
    await expect(collect(wrapped)).rejects.toThrow('boom');
  });

  it('cleans up heartbeat on normal completion', async () => {
    vi.useFakeTimers();
    const wrapped = toSseStream(streamFrom(['data: x\n\n']), {
      appendDone: false,
      keepAliveMs: 10,
    });
    expect(await collect(wrapped)).toBe('data: x\n\n');
    await vi.advanceTimersByTimeAsync(10);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('invokes onDone before appending [DONE]', async () => {
    let called = false;
    const wrapped = toSseStream(streamFrom(['data: x\n\n']), {
      appendDone: true,
      keepAliveMs: 0,
      onDone: () => {
        called = true;
      },
    });
    await collect(wrapped);
    expect(called).toBe(true);
  });

  it('propagates cancel to the inner reader', async () => {
    let cancelled = false;
    const inner = new ReadableStream<string>({
      pull(c) {
        c.enqueue('data: x\n\n');
      },
      cancel() {
        cancelled = true;
      },
    });
    const wrapped = toSseStream(inner, { appendDone: true, keepAliveMs: 0 });
    const reader = wrapped.getReader();
    await reader.read();
    await reader.cancel();
    expect(cancelled).toBe(true);
  });

  it('creates an encoded SSE response', async () => {
    const response = createSseResponse(streamFrom(['data: x\n\n']));
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(await response.text()).toBe('data: x\n\n');
  });

  it('merges requestId into the SSE response headers when provided', async () => {
    const response = createSseResponse(streamFrom(['data: x\n\n']), {
      requestId: 'req_abc123',
    });
    expect(response.headers.get('x-request-id')).toBe('req_abc123');
    await response.text();
  });

  it('omits x-request-id when no requestId is provided', async () => {
    const response = createSseResponse(streamFrom(['data: x\n\n']));
    expect(response.headers.get('x-request-id')).toBeNull();
    await response.text();
  });
});
