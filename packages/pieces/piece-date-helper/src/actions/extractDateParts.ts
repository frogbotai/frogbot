import { z } from 'zod';

import { extractUnits, formatSchema, parseDate } from '../date.js';
import { defineAction } from '../define.js';

const input = z.object({
  inputDate: z.string().meta({ label: 'Input Date' }),
  inputFormat: formatSchema.meta({ label: 'From Time Format' }),
  unitExtract: z.array(z.enum(extractUnits)).default(['year']).meta({ label: 'Units to Extract' }),
});

export const extractDateParts = defineAction({
  slug: 'extractDateParts',
  label: 'Extract Date Parts',
  description: 'Extract selected units from a date.',
  input,
  output: z.record(z.string(), z.union([z.string(), z.number()])),
  idempotent: true,
  run({ input: value }) {
    const date = parseDate(value.inputDate, value.inputFormat);
    const available = {
      year: date.year(),
      month: date.month() + 1,
      day: date.date(),
      hour: date.hour(),
      minute: date.minute(),
      second: date.second(),
      dayOfWeek: date.format('dddd'),
      monthName: date.format('MMMM'),
    };

    const result: Record<string, string | number> = {};

    value.unitExtract.forEach((unit) => {
      result[unit] = available[unit];
    });

    return Promise.resolve(result);
  },
});
