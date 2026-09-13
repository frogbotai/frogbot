import { type PieceActionDefinition, type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { parseNumbers } from '../numbers.js';

const inputSchema = z.object({
  values: z.array(z.unknown()).min(1).meta({ label: 'Values' }),
});

const outputSchema = z.object({ average: z.number() });

export const calculateAverage = {
  slug: 'calculateAverage',
  label: 'Calculate Average',
  description: 'Calculate the average of a list of values.',
  input: inputSchema,
  output: outputSchema,
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    const values = parseNumbers(input.values);
    const sum = values.reduce((total, value) => total + value, 0);

    return { average: sum / values.length };
  },
} satisfies PieceActionDefinition<typeof inputSchema, typeof outputSchema, object, undefined>;
