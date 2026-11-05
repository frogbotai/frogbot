import type { UIMessageChunk } from 'ai';

import type { CompactionPart } from './history.js';

/** A compaction part, sent once the reply's stream has finished `step` steps. */
export type CompactionEvent = { step: number; part: CompactionPart };

export type CompactionParts = {
  emit: (event: CompactionEvent) => void;
  /** Every part emitted so far, the latest state of each. */
  parts: () => CompactionPart[];
  wrap: (stream: ReadableStream<UIMessageChunk>) => ReadableStream<UIMessageChunk>;
};

/**
 * Collects the compaction parts a run emits from inside the agent loop and puts each one into the
 * reply's stream between steps: a step-`N` part after the `N`th `finish-step` chunk, a step-0 part
 * after `start`. Parts still waiting when the stream ends or fails are sent before it closes.
 */
export function createCompactionParts(): CompactionParts {
  const events: CompactionEvent[] = [];
  let wake: (() => void) | undefined;

  return {
    emit: (event) => {
      events.push(event);
      wake?.();
    },
    parts: () => [...new Map(events.map(({ part }) => [part.id, part])).values()],
    wrap: (stream) => {
      const reader = stream.getReader();
      let sent = 0;
      let started = false;
      let finishedSteps = 0;
      let reading: Promise<
        { chunk: ReadableStreamReadResult<UIMessageChunk> } | { error: unknown }
      >;

      let pending = false;
      let failure: { error: unknown } | undefined;
      let done = false;

      const due = () => {
        const next = events[sent];

        if (!next) return undefined;

        return done || failure || (started && next.step <= finishedSteps) ? next : undefined;
      };

      return new ReadableStream<UIMessageChunk>({
        pull: async (controller) => {
          for (;;) {
            const next = due();

            if (next) {
              sent++;

              controller.enqueue({
                type: 'data-compaction',
                id: next.part.id,
                data: next.part.data,
              });

              return;
            }

            if (failure) {
              controller.error(failure.error);

              return;
            }

            if (done) {
              controller.close();

              return;
            }

            if (!pending) {
              pending = true;

              reading = reader.read().then(
                (chunk) => ({ chunk }),
                (error: unknown) => ({ error }),
              );
            }

            const woken = new Promise<undefined>((resolve) => {
              wake = () => resolve(undefined);
            });

            const result = await Promise.race([reading, woken]);

            wake = undefined;

            if (result === undefined) continue;

            pending = false;

            if ('error' in result) {
              failure = result;

              continue;
            }

            if (result.chunk.done) {
              done = true;

              continue;
            }

            const chunk = result.chunk.value;

            if (chunk.type === 'start') started = true;

            if (chunk.type === 'finish-step') finishedSteps++;

            controller.enqueue(chunk);

            return;
          }
        },
        cancel: (reason) => reader.cancel(reason),
      });
    },
  };
}
