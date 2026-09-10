import { describe, expect, it } from 'vitest';

import { chunkGenerator } from '../../../../packages/frogbot/src/utilities/chunkGenerator.js';

async function* values(): AsyncGenerator<number> {
  yield 1;
  yield 2;
  yield 3;
  yield 4;
  yield 5;
}

describe('chunkGenerator', () => {
  it('yields fixed-size chunks and a final partial chunk', async () => {
    await expect(Array.fromAsync(chunkGenerator(values(), 2))).resolves.toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
  });
});
