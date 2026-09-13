import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { previousMonthBoundary, previousMonthInput } from './previousMonth.js';

export const lastDayOfPreviousMonth = {
  slug: 'lastDayOfPreviousMonth',
  label: 'Last Day of Previous Month',
  description: 'Get the last day of the previous month.',
  input: previousMonthInput,
  output: z.object({ result: z.string() }),
  idempotent: false,
  async run({ input }: PieceRunArgs<z.output<typeof previousMonthInput>, object, undefined>) {
    return previousMonthBoundary(input, 'endOf');
  },
};
