import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { postTurn } from '../../../../packages/frogbot/src/channels/postTurn.js';
import { question } from '../../../../packages/frogbot/src/tools/question.js';
import type { AnyTool } from '../../../../packages/frogbot/src/tools/types.js';
import { asyncChunks } from './helpers.js';

type Chunk = { type: string; [key: string]: unknown };

function fakeThread(adapter = 'slack') {
  const posted: unknown[][] = [];
  const thread = {
    adapter: { name: adapter },
    startTyping: vi.fn<(status?: string) => Promise<void>>(async () => {}),
    post: vi.fn(async (stream: AsyncIterable<unknown>) => {
      const chunks: unknown[] = [];

      posted.push(chunks);

      for await (const chunk of stream) chunks.push(chunk);
    }),
  };

  return { thread, posted };
}

function chunks(list: Chunk[]): AsyncIterable<Chunk> {
  return asyncChunks(...list);
}

function failingStream(error: Error): AsyncIterable<Chunk> {
  let read = false;

  return {
    [Symbol.asyncIterator]: () => ({
      next: () => {
        if (read) return Promise.reject(error);

        read = true;

        return Promise.resolve({ done: false, value: toolStart('exa_search') });
      },
    }),
  };
}

function run(
  thread: ReturnType<typeof fakeThread>['thread'],
  stream: AsyncIterable<unknown>,
  persistence: Promise<void> = Promise.resolve(),
  logger = fakeLogger(),
) {
  const controller = new AbortController();
  const promise = postTurn({
    thread: thread as never,
    result: { stream: stream as never, persistence },
    controller,
    tools: [
      { slug: 'exa_search', label: 'Exa: Search' } as AnyTool,
      { slug: 'plain' } as AnyTool,
      question,
    ],
    logger: logger as never,
  });

  return { controller, promise };
}

function fakeLogger() {
  return { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() };
}

function statuses(thread: ReturnType<typeof fakeThread>['thread']): unknown[] {
  return thread.startTyping.mock.calls.map(([status]) => status);
}

function controlledStream() {
  const queue: Chunk[] = [];
  let wake: (() => void) | undefined;
  let done = false;

  const stream = (async function* (): AsyncGenerator<Chunk> {
    for (;;) {
      const chunk = queue.shift();

      if (chunk) {
        yield chunk;
        continue;
      }

      if (done) return;

      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  })();

  return {
    stream,
    push(...chunks: Chunk[]) {
      queue.push(...chunks);
      wake?.();
    },
    end() {
      done = true;
      wake?.();
    },
  };
}

const text = (value: string): Chunk => ({ type: 'text-delta', text: value });
const toolStart = (toolName: string): Chunk => ({ type: 'tool-input-start', id: '1', toolName });
const toolResult = (toolName: string): Chunk => ({
  type: 'tool-result',
  toolCallId: '1',
  toolName,
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('postTurn', () => {
  it('posts nothing for a tool-only stream', async () => {
    const { thread } = fakeThread();

    await run(thread, chunks([toolStart('exa_search'), toolResult('exa_search')])).promise;

    expect(thread.post).not.toHaveBeenCalled();
  });

  it('posts every buffered chunk in order once text arrives', async () => {
    const { thread, posted } = fakeThread();
    const list = [toolStart('exa_search'), toolResult('exa_search'), text('Hi'), text(' there')];

    await run(thread, chunks(list)).promise;

    expect(posted).toEqual([list]);
  });

  it('aborts and rethrows when the stream throws', async () => {
    const { thread } = fakeThread();
    const error = new Error('stream failed');
    const { controller, promise } = run(thread, failingStream(error));

    await expect(promise).rejects.toBe(error);
    expect(controller.signal.reason).toBe(error);
  });

  it('aborts and rethrows when the post throws', async () => {
    const { thread } = fakeThread();
    const error = new Error('post failed');

    thread.post.mockRejectedValueOnce(error);

    const { controller, promise } = run(thread, chunks([text('Hi')]));

    await expect(promise).rejects.toBe(error);
    expect(controller.signal.reason).toBe(error);
  });

  it('waits for persistence after a stream or a post throws', async () => {
    for (const failing of ['stream', 'post'] as const) {
      const { thread } = fakeThread();
      const error = new Error(failing);
      let persist!: () => void;
      const persistence = new Promise<void>((resolve) => {
        persist = resolve;
      });

      if (failing === 'post') thread.post.mockRejectedValueOnce(error);

      const stream = failing === 'stream' ? failingStream(error) : chunks([text('Hi')]);

      const { promise } = run(thread, stream, persistence);
      let settled = false;

      promise.then(
        () => (settled = true),
        () => (settled = true),
      );

      await vi.advanceTimersByTimeAsync(0);

      expect(settled).toBe(false);

      persist();

      await expect(promise).rejects.toBe(error);
    }
  });
});

describe('postTurn typing', () => {
  it('starts typing before the first chunk is read', async () => {
    const { thread } = fakeThread();
    let typingAtFirstRead: unknown[] | undefined;
    const stream = {
      [Symbol.asyncIterator]() {
        return {
          next: () => {
            typingAtFirstRead ??= statuses(thread);

            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    };

    await run(thread, stream).promise;

    expect(typingAtFirstRead).toEqual(['is thinking…']);
  });

  it('refreshes typing at most 4 s apart through a 30 s tool call', async () => {
    const { thread } = fakeThread();
    const sentAt: number[] = [];
    const start = Date.now();

    const record = () => {
      sentAt.push(Date.now() - start);

      return Promise.resolve();
    };

    thread.startTyping.mockImplementation(record);
    thread.post.mockImplementation(record);

    const controlled = controlledStream();
    const { promise } = run(thread, controlled.stream);

    controlled.push(toolStart('exa_search'));
    await vi.advanceTimersByTimeAsync(30_000);
    controlled.push(toolResult('exa_search'));
    await vi.advanceTimersByTimeAsync(1_000);
    controlled.push(text('Done'));
    controlled.end();
    await promise;

    const gaps = sentAt.slice(1).map((time, index) => time - sentAt[index]);

    expect(sentAt.at(-1)).toBe(31_000);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(4_000);
    expect(sentAt.length).toBeGreaterThan(8);
  });

  it('names the running tool by its label, then its slug, and returns to thinking', async () => {
    const { thread } = fakeThread();

    await run(
      thread,
      chunks([
        toolStart('exa_search'),
        { type: 'tool-call', toolCallId: '1', toolName: 'exa_search', input: {} },
        toolResult('exa_search'),
        toolStart('plain'),
        { type: 'tool-error', toolCallId: '2', toolName: 'plain', error: 'nope' },
        text('Done'),
      ]),
    ).promise;

    expect(statuses(thread)).toEqual([
      'is thinking…',
      'is using Exa: Search…',
      'is thinking…',
      'is using plain…',
      'is thinking…',
    ]);
  });

  it('sends no typing once the reply starts posting', async () => {
    const { thread } = fakeThread();
    let sentBeforePost = -1;

    thread.post.mockImplementation(async (stream: AsyncIterable<unknown>) => {
      sentBeforePost = thread.startTyping.mock.calls.length;

      for await (const _chunk of stream) await vi.advanceTimersByTimeAsync(5_000);
    });

    await run(
      thread,
      chunks([text('Hi'), toolStart('exa_search'), toolResult('exa_search'), text('Done')]),
    ).promise;

    expect(sentBeforePost).toBe(1);
    expect(thread.startTyping).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the status and leaves no timer when no text posts', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const failures: [string, AsyncIterable<unknown>][] = [
      ['tool-only', chunks([toolStart('exa_search'), toolResult('exa_search')])],
      ['aborted', failingStream(abort)],
      ['throwing', failingStream(new Error('failed'))],
    ];

    for (const [name, stream] of failures) {
      const { thread } = fakeThread();

      await run(thread, stream).promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(0);

      expect(statuses(thread).at(-1), name).toBe('');
      expect(vi.getTimerCount(), name).toBe(0);
      expect(thread.post, name).not.toHaveBeenCalled();
    }
  });

  it('posts the same chunks at the same time when typing fails', async () => {
    const broken: [string, (thread: ReturnType<typeof fakeThread>['thread']) => void][] = [
      ['working', () => {}],
      [
        'throwing',
        (thread) =>
          thread.startTyping.mockImplementation(() => {
            throw new Error('typing failed');
          }),
      ],
      ['rejecting', (thread) => thread.startTyping.mockRejectedValue(new Error('typing failed'))],
      ['hanging', (thread) => thread.startTyping.mockReturnValue(new Promise(() => {}))],
      ['missing', (thread) => Reflect.deleteProperty(thread, 'startTyping')],
    ];

    const results: { name: string; posted: unknown[][]; postedAt: number; warned: number }[] = [];

    for (const [name, breakTyping] of broken) {
      const { thread, posted } = fakeThread();
      const logger = fakeLogger();
      const start = Date.now();
      let postedAt = -1;
      const post = thread.post.getMockImplementation()!;

      thread.post.mockImplementation(async (stream) => {
        postedAt = Date.now() - start;

        await post(stream);
      });

      breakTyping(thread);

      const controlled = controlledStream();
      const { promise } = run(thread, controlled.stream, undefined, logger);

      controlled.push(toolStart('exa_search'));
      await vi.advanceTimersByTimeAsync(6_000);
      controlled.push(toolResult('exa_search'), text('Done'));
      controlled.end();
      await promise;

      results.push({ name, posted, postedAt, warned: logger.warn.mock.calls.length });
    }

    const [working, ...failing] = results;

    expect(working).toMatchObject({ postedAt: 6_000, warned: 0 });

    for (const result of failing) {
      expect(result, result.name).toMatchObject({
        posted: working.posted,
        postedAt: working.postedAt,
        warned: result.name === 'hanging' ? 0 : 1,
      });
    }
  });

  it('ends a turn that pauses for a question or an approval cleared, with no timer', async () => {
    const pauses: [string, Chunk[]][] = [
      ['question', [toolStart('question'), { type: 'finish' }]],
      [
        'approval',
        [
          toolStart('exa_search'),
          { type: 'tool-call', toolCallId: '1', toolName: 'exa_search', input: {} },
          { type: 'tool-approval-request', approvalId: 'a', toolCallId: '1' },
          { type: 'finish' },
        ],
      ],
    ];

    for (const [name, list] of pauses) {
      const { thread } = fakeThread();

      await run(thread, chunks(list)).promise;
      await vi.advanceTimersByTimeAsync(10_000);

      expect(statuses(thread), name).toEqual([
        'is thinking…',
        name === 'question' ? 'is using Ask a question…' : 'is using Exa: Search…',
        '',
      ]);
      expect(vi.getTimerCount(), name).toBe(0);
    }
  });

  it('sends no empty status on adapters whose typing ignores it', async () => {
    for (const adapter of ['discord', 'telegram', 'teams', 'linear']) {
      const { thread } = fakeThread(adapter);

      await run(thread, chunks([toolStart('exa_search'), toolResult('exa_search')])).promise;
      await run(thread, failingStream(new Error('failed'))).promise.catch(() => {});

      expect(statuses(thread), adapter).not.toContain('');
      expect(vi.getTimerCount(), adapter).toBe(0);
    }
  });

  it('does not refresh a Linear thought, which stays until the next activity', async () => {
    const { thread } = fakeThread('linear');
    const controlled = controlledStream();
    const { promise } = run(thread, controlled.stream);

    controlled.push(toolStart('exa_search'));
    await vi.advanceTimersByTimeAsync(30_000);
    controlled.push(toolResult('exa_search'));
    await vi.advanceTimersByTimeAsync(30_000);
    controlled.push(text('Done'));
    controlled.end();
    await promise;

    expect(statuses(thread)).toEqual(['is thinking…', 'is using Exa: Search…', 'is thinking…']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps refreshing on adapters whose typing expires', async () => {
    const { thread } = fakeThread('discord');
    const controlled = controlledStream();
    const { promise } = run(thread, controlled.stream);

    await vi.advanceTimersByTimeAsync(12_000);
    controlled.push(text('Done'));
    controlled.end();
    await promise;

    expect(thread.startTyping).toHaveBeenCalledTimes(4);
  });

  it('types without an adapter name when the thread has no adapter', async () => {
    const { thread, posted } = fakeThread();

    Object.defineProperty(thread, 'adapter', {
      get() {
        throw new Error('Thread has no adapter configured');
      },
    });

    await run(thread, chunks([text('Hi')])).promise;

    expect(statuses(thread)).toEqual(['is thinking…']);
    expect(posted).toEqual([[text('Hi')]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts, rethrows and waits for persistence when posting fails, with no timer', async () => {
    const { thread } = fakeThread();
    const failure = new Error('post failed');
    let persisted = false;
    let release!: () => void;
    const persistence = new Promise<void>((resolve) => {
      release = () => {
        persisted = true;
        resolve();
      };
    });

    thread.post.mockRejectedValue(failure);
    thread.startTyping.mockReturnValue(new Promise(() => {}));

    const { controller, promise } = run(thread, chunks([text('Hi')]), persistence);
    const settled = promise.then(
      () => 'resolved',
      (error: unknown) => (error === failure && persisted ? 'rejected after persistence' : 'early'),
    );

    await vi.advanceTimersByTimeAsync(10_000);
    release();

    await expect(settled).resolves.toBe('rejected after persistence');
    expect(controller.signal.reason).toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('treats whitespace and string chunks like before', async () => {
    const { thread, posted } = fakeThread();

    await run(thread, chunks([text('  '), text('\n')])).promise;

    expect(thread.post).not.toHaveBeenCalled();

    await run(thread, asyncChunks<unknown>(' ', 'Hi')).promise;

    expect(posted).toEqual([[' ', 'Hi']]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
