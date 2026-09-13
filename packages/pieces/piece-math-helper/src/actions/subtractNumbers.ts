import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

const inputSchema = z.object({
  firstNumber: z.number().meta({ label: 'First Number' }),
  secondNumber: z.number().meta({ label: 'Second Number' }),
});
const output = z.number();

export const subtractNumbers = {
  slug: 'subtractNumbers',
  label: 'Subtract Numbers',
  description: 'Subtract the first number from the second number.',
  input: inputSchema,
  output,
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    return input.secondNumber - input.firstNumber;
  },
};
