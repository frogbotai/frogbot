import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { previousMonthBoundary, previousMonthInput } from './previousMonth.js';

export const firstDayOfPreviousMonth = {
  slug: 'firstDayOfPreviousMonth',
  label: 'First Day of Previous Month',
  description: 'Get the first day of the previous month.',
  input: previousMonthInput,
  output: z.object({ result: z.string() }),
  idempotent: false,
  async run({ input }: PieceRunArgs<z.output<typeof previousMonthInput>, object, undefined>) {
    return previousMonthBoundary(input, 'startOf');
  },
};
