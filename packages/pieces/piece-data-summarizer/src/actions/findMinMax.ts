import { z } from 'zod';

import { defineAction } from '../define.js';
import { parseNumbers } from '../numbers.js';

const inputSchema = z.object({
  values: z.array(z.unknown()).min(1).meta({ label: 'Values' }),
});

const outputSchema = z.object({ min: z.number(), max: z.number() });

export const findMinMax = defineAction({
  slug: 'findMinMax',
  label: 'Find Minimum and Maximum',
  description: 'Find the smallest and greatest values in a list.',
  input: inputSchema,
  output: outputSchema,
  run({ input }) {
    const values = parseNumbers(input.values);

    return Promise.resolve({ min: Math.min(...values), max: Math.max(...values) });
  },
});
