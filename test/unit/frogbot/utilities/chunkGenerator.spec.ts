import { describe, expect, it } from 'vitest';

import { chunkGenerator } from '../../../../packages/frogbot/src/utilities/chunkGenerator.js';

function asyncIterable<T>(items: Iterable<T>): AsyncIterable<T> {
  const iterator = items[Symbol.iterator]();

  return { [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve(iterator.next()) }) };
}

describe('chunkGenerator', () => {
  it('yields fixed-size chunks and a final partial chunk', async () => {
    await expect(
      Array.fromAsync(chunkGenerator(asyncIterable([1, 2, 3, 4, 5]), 2)),
    ).resolves.toEqual([[1, 2], [3, 4], [5]]);
  });
});
