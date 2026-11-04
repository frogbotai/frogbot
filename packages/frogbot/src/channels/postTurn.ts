import type { Thread } from 'chat';

import type { AgentStreamResult } from '../agents/types.js';
import type { Logger } from '../frogbot.js';
import type { AnyTool } from '../tools/types.js';
import type { Typing } from './typing.js';
import { startTyping } from './typing.js';

export async function postTurn({
  thread,
  result,
  controller,
  tools = [],
  logger,
}: {
  thread: Thread;
  result: Pick<AgentStreamResult, 'stream'> & { persistence: Promise<void> };
  controller: AbortController;
  tools?: readonly AnyTool[];
  logger: Logger;
}): Promise<void> {
  const labels = new Map(tools.flatMap(({ slug, label }) => (label ? [[slug, label]] : [])));
  const typing = startTyping({ thread, labels, logger });

  try {
    const stream = await withText(result.stream, typing);

    if (stream) await thread.post(stream);
  } catch (error) {
    controller.abort(error);

    throw error;
  } finally {
    typing.stop({ clear: true });

    await result.persistence;
  }
}

async function withText<T>(
  stream: AsyncIterable<T>,
  typing: Typing,
): Promise<AsyncIterable<T> | undefined> {
  const iterator = stream[Symbol.asyncIterator]();
  const buffered: T[] = [];

  for (;;) {
    const next = await iterator.next();

    if (next.done) return undefined;

    buffered.push(next.value);

    if (hasText(next.value)) break;

    typing.update(next.value);
  }

  typing.stop({ clear: false });

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
