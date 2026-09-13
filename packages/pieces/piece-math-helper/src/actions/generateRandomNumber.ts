import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

const inputSchema = z.object({
  firstNumber: z.number().meta({ label: 'First Number' }),
  secondNumber: z.number().meta({ label: 'Second Number' }),
});
const output = z.number();

export const generateRandomNumber = {
  slug: 'generateRandomNumber',
  label: 'Generate Random Number',
  description: 'Generate a random integer between two numbers, inclusive.',
  input: inputSchema,
  output,
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    return Math.floor(
      Math.random() * (input.secondNumber - input.firstNumber + 1) + input.firstNumber,
    );
  },
};
