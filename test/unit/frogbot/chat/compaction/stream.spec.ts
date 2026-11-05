import type { UIMessageChunk } from 'ai';
import { describe, expect, it } from 'vitest';

import type { CompactionPart } from '../../../../../packages/frogbot/src/chat/compaction/history.js';
import { createCompactionParts } from '../../../../../packages/frogbot/src/chat/compaction/stream.js';

const part = (status: CompactionPart['data']['status']): CompactionPart => ({
  type: 'data-compaction',
  id: 'part-1',
  data: { status, reason: 'auto' },
});

const chunk = (status: CompactionPart['data']['status']) => ({
  type: 'data-compaction',
  id: 'part-1',
  data: { status, reason: 'auto' },
});

const steps: UIMessageChunk[] = [
  { type: 'start' },
  { type: 'start-step' },
  { type: 'text-start', id: 't1' },
  { type: 'text-end', id: 't1' },
  { type: 'finish-step' },
  { type: 'start-step' },
  { type: 'finish-step' },
  { type: 'finish' },
];

function source(chunks: UIMessageChunk[], error?: Error) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const value of chunks) controller.enqueue(value);

      if (error) controller.error(error);
      else controller.close();
    },
  });
}

async function read(stream: ReadableStream<UIMessageChunk>) {
  const chunks: unknown[] = [];
  const reader = stream.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) return { chunks };

      chunks.push(value);
    }
  } catch (error) {
    return { chunks, error };
  }
}

describe('createCompactionParts', () => {
  it('puts a step-0 part after start and a step-1 part after the first finished step', async () => {
    const compaction = createCompactionParts();

    compaction.emit({ step: 0, part: part('completed') });
    compaction.emit({ step: 1, part: { ...part('completed'), id: 'part-2' } });

    const { chunks } = await read(compaction.wrap(source(steps)));

    expect(chunks.map((value) => (value as { type: string }).type)).toEqual([
      'start',
      'data-compaction',
      'start-step',
      'text-start',
      'text-end',
      'finish-step',
      'data-compaction',
      'start-step',
      'finish-step',
      'finish',
    ]);
  });

  it('streams a part emitted while the next chunk is still pending', async () => {
    const compaction = createCompactionParts();
    let release!: () => void;

    const stream = new ReadableStream<UIMessageChunk>({
      async start(controller) {
        controller.enqueue({ type: 'start' });

        await new Promise<void>((resolve) => {
          release = resolve;
        });

        controller.enqueue({ type: 'finish' });
        controller.close();
      },
    });

    const reader = compaction.wrap(stream).getReader();

    expect((await reader.read()).value).toEqual({ type: 'start' });

    const next = reader.read();

    compaction.emit({ step: 0, part: part('running') });

    expect((await next).value).toEqual(chunk('running'));

    release();

    expect((await reader.read()).value).toEqual({ type: 'finish' });
  });

  it('sends a waiting part before the stream fails', async () => {
    const compaction = createCompactionParts();

    compaction.emit({ step: 0, part: part('running') });
    compaction.emit({ step: 0, part: part('failed') });

    const failure = new Error('Summary failed.');
    const { chunks, error } = await read(compaction.wrap(source([], failure)));

    expect(chunks).toEqual([chunk('running'), chunk('failed')]);
    expect(error).toBe(failure);
  });

  it('keeps the latest state of each part', () => {
    const compaction = createCompactionParts();

    compaction.emit({ step: 0, part: part('running') });
    compaction.emit({ step: 0, part: part('completed') });

    expect(compaction.parts()).toEqual([part('completed')]);
  });
});
