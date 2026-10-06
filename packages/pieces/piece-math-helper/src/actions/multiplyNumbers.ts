import { z } from 'zod';

import { defineAction } from '../define.js';

const inputSchema = z.object({
  firstNumber: z.number().meta({ label: 'First Number' }),
  secondNumber: z.number().meta({ label: 'Second Number' }),
});
const output = z.number();

export const multiplyNumbers = defineAction({
  slug: 'multiplyNumbers',
  label: 'Multiply Numbers',
  description: 'Multiply the first number by the second number.',
  input: inputSchema,
  output,
  run({ input }) {
    return Promise.resolve(input.firstNumber * input.secondNumber);
  },
});
