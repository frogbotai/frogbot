import { z } from 'zod';

import { defineAction } from '../define.js';

const inputSchema = z.object({
  firstNumber: z.number().meta({ label: 'First Number' }),
  secondNumber: z
    .number()
    .refine((value) => value !== 0, 'Second number cannot be zero')
    .meta({ label: 'Second Number' }),
});
const output = z.number();

export const divideNumbers = defineAction({
  slug: 'divideNumbers',
  label: 'Divide Numbers',
  description: 'Divide the first number by the second number.',
  input: inputSchema,
  output,
  async run({ input }) {
    return input.firstNumber / input.secondNumber;
  },
});
