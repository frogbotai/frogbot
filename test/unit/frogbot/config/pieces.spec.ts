import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { sanitize } from '../../../../packages/frogbot/src/config/sanitize.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';
import type { Piece, PieceInstance } from '../../../../packages/frogbot/src/pieces/types.js';

const db = {} as never;

const createExample = definePiece({
  slug: 'example',
  label: 'Example',
  actions: [
    {
      slug: 'run',
      description: 'Run',
      input: z.object({}),
      async run() {},
    },
  ],
});

describe('piece config', () => {
  it('accepts a native piece instance', () => {
    const example = createExample();
    const result = sanitize({ secret: 'secret', db, collections: [], pieces: [example] });

    expect(result.pieces).toMatchObject({
      instances: [example],
    });
  });

  it('exposes only native instances at the type boundary', () => {
    expectTypeOf<Piece>().toEqualTypeOf<PieceInstance>();
  });
});
