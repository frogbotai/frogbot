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

async function* iterate(records: TrainingDataRecord[]): AsyncGenerator<TrainingDataRecord> {
  for (const record of records) yield record;
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

    const output = await readAll(encodeTrainingData(iterate(records)));
    const lines = output.trimEnd().split('\n');

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => JSON.parse(line))).toEqual(records);
  });

  it('streams before the source is exhausted', async () => {
    let yielded = 0;
    async function* slow(): AsyncGenerator<TrainingDataRecord> {
      while (true) {
        yielded += 1;
        yield { chat: { id: yielded }, messages: [] };
      }
    }

    const reader = encodeTrainingData(slow()).getReader();
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
        next: async () => ({ done: false, value: { chat: {}, messages: [] } }),
        return: async () => {
          onReturn();
          return { done: true, value: undefined };
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
