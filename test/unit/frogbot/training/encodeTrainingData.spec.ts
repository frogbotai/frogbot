import { describe, expect, it, vi } from 'vitest';

import { encodeTrainingData } from '../../../../packages/frogbot/src/training/encodeTrainingData.js';
import type { TrainingDataRecord } from '../../../../packages/frogbot/src/training/types.js';

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

function asyncIterable<T>(items: Iterable<T>): AsyncIterable<T> {
  const iterator = items[Symbol.iterator]();

  return {
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve(iterator.next()),
      return: () => Promise.resolve(iterator.return?.() ?? { done: true, value: undefined }),
    }),
  };
}

describe('encodeTrainingData', () => {
  it('writes one lossless parseable line per conversation', async () => {
    const records: TrainingDataRecord[] = [
      {
        chat: { id: 1, title: 'first' },
        messages: [
          { id: 'a', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
          { id: 'b', role: 'assistant', parts: [{ type: 'tool-call', input: { nested: [1, 2] } }] },
        ],
      },
      { chat: { id: 2 }, messages: [] },
    ];

    const output = await readAll(encodeTrainingData(asyncIterable(records)));
    const lines = output.trimEnd().split('\n');

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => JSON.parse(line))).toEqual(records);
  });

  it('streams before the source is exhausted', async () => {
    let yielded = 0;
    function* slow(): Generator<TrainingDataRecord> {
      while (true) {
        yielded += 1;
        yield { chat: { id: yielded }, messages: [] };
      }
    }

    const reader = encodeTrainingData(asyncIterable(slow())).getReader();
    await reader.read();
    await reader.cancel();

    expect(yielded).toBeLessThan(5);
  });

  it('propagates reader errors', async () => {
    const failing = {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new Error('boom')),
      }),
    } as unknown as AsyncIterable<TrainingDataRecord>;

    await expect(readAll(encodeTrainingData(failing))).rejects.toThrow('boom');
  });

  it('closes the source iterator on cancel', async () => {
    const onReturn = vi.fn();
    const records = {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.resolve({ done: false, value: { chat: {}, messages: [] } }),
        return: () => {
          onReturn();
          return Promise.resolve({ done: true, value: undefined });
        },
      }),
    } as unknown as AsyncIterable<TrainingDataRecord>;

    const stream = encodeTrainingData(records);
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();

    expect(onReturn).toHaveBeenCalled();
  });
});
