import { z } from 'zod';

import { defineAction } from '../define.js';

const inputSchema = z.object({
  firstNumber: z.number().meta({ label: 'First Number' }),
  secondNumber: z.number().meta({ label: 'Second Number' }),
});
const output = z.number();

export const addNumbers = defineAction({
  slug: 'addNumbers',
  label: 'Add Numbers',
  description: 'Add the first number and the second number.',
  input: inputSchema,
  output,
  async run({ input }) {
    return input.firstNumber + input.secondNumber;
  },
});
