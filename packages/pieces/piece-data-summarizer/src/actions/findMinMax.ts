import { type PieceActionDefinition, type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { parseNumbers } from '../numbers.js';

const inputSchema = z.object({
  values: z.array(z.unknown()).min(1).meta({ label: 'Values' }),
});

const outputSchema = z.object({ min: z.number(), max: z.number() });

export const findMinMax = {
  slug: 'findMinMax',
  label: 'Find Minimum and Maximum',
  description: 'Find the smallest and greatest values in a list.',
  input: inputSchema,
  output: outputSchema,
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const values = parseNumbers(input.values);

    return { min: Math.min(...values), max: Math.max(...values) };
  },
} satisfies PieceActionDefinition<typeof inputSchema, typeof outputSchema, object, undefined>;
