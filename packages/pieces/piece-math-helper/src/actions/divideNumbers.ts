import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

const inputSchema = z.object({
  firstNumber: z.number().meta({ label: 'First Number' }),
  secondNumber: z
    .number()
    .refine((value) => value !== 0, 'Second number cannot be zero')
    .meta({ label: 'Second Number' }),
});
const output = z.number();

export const divideNumbers = {
  slug: 'divideNumbers',
  label: 'Divide Numbers',
  description: 'Divide the first number by the second number.',
  input: inputSchema,
  output,
  async run({ input }: PieceRunArgs<z.output<typeof inputSchema>, object, undefined>) {
    return input.firstNumber / input.secondNumber;
  },
};
