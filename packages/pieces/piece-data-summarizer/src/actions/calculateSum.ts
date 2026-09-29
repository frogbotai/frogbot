import { z } from 'zod';

import { defineAction } from '../define.js';
import { parseNumbers } from '../numbers.js';

const inputSchema = z.object({
  values: z.array(z.unknown()).meta({ label: 'Values' }),
});

const outputSchema = z.object({ sum: z.number() });

export const calculateSum = defineAction({
  slug: 'calculateSum',
  label: 'Calculate Sum',
  description: 'Calculate the sum of a list of values.',
  input: inputSchema,
  output: outputSchema,
  async run({ input }) {
    const values = parseNumbers(input.values);
    const sum = values.reduce((total, value) => total + value, 0);

    return { sum };
  },
});
