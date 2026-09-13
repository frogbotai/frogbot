import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { dayjs, formatSchema, parseDate, units } from '../date.js';

const input = z.object({
  startDate: z.string().meta({ label: 'Starting Date' }),
  startDateFormat: formatSchema.meta({ label: 'Starting Date Format' }),
  endDate: z.string().meta({ label: 'Ending Date' }),
  endDateFormat: formatSchema.meta({ label: 'Ending Date Format' }),
  unitDifference: z.array(z.enum(units)).default(['year']).meta({ label: 'Units' }),
});

export const dateDifference = {
  slug: 'dateDifference',
  label: 'Date Difference',
  description: 'Get the component difference between two dates.',
  input,
  output: z.record(z.string(), z.number()),
  idempotent: true,
  async run({ input: value }: PieceRunArgs<z.output<typeof input>, object, undefined>) {
    const start = parseDate(value.startDate, value.startDateFormat);
    const end = parseDate(value.endDate, value.endDateFormat);
    const difference = dayjs.duration(end.diff(start));
    const available = {
      year: difference.years(),
      month: difference.months(),
      day: difference.days(),
      hour: difference.hours(),
      minute: difference.minutes(),
      second: difference.seconds(),
    };
    const result: Record<string, number> = {};

    value.unitDifference.forEach((unit) => {
      result[unit] = available[unit];
    });

    return result;
  },
};
