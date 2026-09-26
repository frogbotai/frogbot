import type { Thread } from 'chat';

import type { AgentStreamResult } from '../agents/types.js';

export async function postTurn({
  thread,
  result,
  controller,
}: {
  thread: Thread;
  result: Pick<AgentStreamResult, 'stream'> & { persistence: Promise<void> };
  controller: AbortController;
}): Promise<void> {
  try {
    const stream = await withText(result.stream);

    if (stream) await thread.post(stream);
  } catch (error) {
    controller.abort(error);

    throw error;
  } finally {
    await result.persistence;
  }
}

async function withText<T>(stream: AsyncIterable<T>): Promise<AsyncIterable<T> | undefined> {
  const iterator = stream[Symbol.asyncIterator]();
  const buffered: T[] = [];

  for (;;) {
    const next = await iterator.next();

    if (next.done) return undefined;

    buffered.push(next.value);

    if (hasText(next.value)) break;
  }

  return (async function* () {
    yield* buffered;

    for (;;) {
      const next = await iterator.next();

      if (next.done) return;

      yield next.value;
    }
  })();
}

function hasText(chunk: unknown): boolean {
  if (typeof chunk === 'string') return chunk.trim().length > 0;

  return (
    !!chunk &&
    typeof chunk === 'object' &&
    'type' in chunk &&
    chunk.type === 'text-delta' &&
    'text' in chunk &&
    typeof chunk.text === 'string' &&
    chunk.text.trim().length > 0
  );
}
