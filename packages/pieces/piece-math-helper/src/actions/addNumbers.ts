import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

const inputSchema = z.object({
  firstNumber: z.number().meta({ label: 'First Number' }),
  secondNumber: z.number().meta({ label: 'Second Number' }),
});
const output = z.number();

export const addNumbers = {
  slug: 'addNumbers',
  label: 'Add Numbers',
  description: 'Add the first number and the second number.',
  input: inputSchema,
  output,
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    return input.firstNumber + input.secondNumber;
  },
};
