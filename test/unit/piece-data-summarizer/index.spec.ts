import { describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/pieces/definePiece.js'));

vi.mock('../../../packages/frogbot/src/getFrogbot.js', () => ({
  createDefaultRequest: vi.fn(),
}));

import { pieceActionDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createDataSummarizer } from '../../../packages/pieces/piece-data-summarizer/src/index.js';

const dataSummarizer = createDataSummarizer();
const req = {} as never;

describe('data-summarizer execution', () => {
  it('calculates averages after coercing numeric values', async () => {
    const result = await dataSummarizer.calculateAverage({
      input: { values: [2, '4', true, null] },
      req,
    });

    expect(result).toEqual({ average: 1.75 });
  });

  it('calculates sums and accepts an empty list', async () => {
    await expect(
      dataSummarizer.calculateSum({ input: { values: ['1.5', 2.5] }, req }),
    ).resolves.toEqual({ sum: 4 });

    await expect(dataSummarizer.calculateSum({ input: { values: [] }, req })).resolves.toEqual({
      sum: 0,
    });
  });

  it('parses action inputs and outputs through their schemas', async () => {
    await expect(dataSummarizer.calculateAverage({ input: { values: [] }, req })).rejects.toThrow();

    const definition = pieceActionDefinition(dataSummarizer.findMinMax);
    const parse = vi.spyOn(definition!.output!, 'parse');

    await expect(dataSummarizer.findMinMax({ input: { values: [3, 1] }, req })).resolves.toEqual({
      min: 1,
      max: 3,
    });

    expect(parse).toHaveBeenCalledWith({ min: 1, max: 3 });
  });

  it('reports every value that cannot be converted to a number', async () => {
    await expect(
      dataSummarizer.calculateAverage({ input: { values: ['frog', 3, {}] }, req }),
    ).rejects.toThrow(
      JSON.stringify({
        message: 'The following values are not numbers',
        errors: [
          { value: 'frog', location: 0 },
          { value: {}, location: 2 },
        ],
      }),
    );
  });

  it('counts unique primitive and object values', async () => {
    await expect(
      dataSummarizer.countUniqueValues({ input: { values: ['frog', 'frog', 1, '1'] }, req }),
    ).resolves.toEqual({ numUniques: 3 });

    await expect(
      dataSummarizer.countUniqueValues({
        input: {
          values: [
            { team: 'green', score: 1 },
            { team: 'green', score: 2 },
            { team: 'blue', score: 1 },
            'discarded',
          ],
          fields: ['team'],
        },
        req,
      }),
    ).resolves.toEqual({ numUniques: 3 });
  });

  it('finds minimum and maximum values after numeric coercion', async () => {
    const result = await dataSummarizer.findMinMax({
      input: { values: ['-2', 8, 3] },
      req,
    });

    expect(result).toEqual({ min: -2, max: 8 });
  });
});
