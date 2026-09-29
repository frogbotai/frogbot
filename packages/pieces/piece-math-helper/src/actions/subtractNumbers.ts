import { z } from 'zod';

import { defineAction } from '../define.js';

const inputSchema = z.object({
  firstNumber: z.number().meta({ label: 'First Number' }),
  secondNumber: z.number().meta({ label: 'Second Number' }),
});
const output = z.number();

export const subtractNumbers = defineAction({
  slug: 'subtractNumbers',
  label: 'Subtract Numbers',
  description: 'Subtract the first number from the second number.',
  input: inputSchema,
  output,
  async run({ input }) {
    return input.secondNumber - input.firstNumber;
  },
});
