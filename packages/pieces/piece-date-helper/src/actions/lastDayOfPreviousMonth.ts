import { z } from 'zod';

import { defineAction } from '../define.js';
import { previousMonthBoundary, previousMonthInput } from './previousMonth.js';

export const lastDayOfPreviousMonth = defineAction({
  slug: 'lastDayOfPreviousMonth',
  label: 'Last Day of Previous Month',
  description: 'Get the last day of the previous month.',
  input: previousMonthInput,
  output: z.object({ result: z.string() }),
  idempotent: false,
  async run({ input }) {
    return previousMonthBoundary(input, 'endOf');
  },
});
