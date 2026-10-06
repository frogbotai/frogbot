import { z } from 'zod';

import { defineAction } from '../define.js';
import { parseNumbers } from '../numbers.js';

const inputSchema = z.object({
  values: z.array(z.unknown()).min(1).meta({ label: 'Values' }),
});

const outputSchema = z.object({ average: z.number() });

export const calculateAverage = defineAction({
  slug: 'calculateAverage',
  label: 'Calculate Average',
  description: 'Calculate the average of a list of values.',
  input: inputSchema,
  output: outputSchema,
  run({ input }) {
    const values = parseNumbers(input.values);
    const sum = values.reduce((total, value) => total + value, 0);

    return Promise.resolve({ average: sum / values.length });
  },
});
