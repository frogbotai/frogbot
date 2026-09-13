import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import {
  correctedFormat,
  dayjs,
  formatSchema,
  parseTime,
  timeSchema,
  timeZoneSchema,
} from '../date.js';

const input = z.object({
  month: z.number().int().min(1).max(12).meta({ label: 'Month' }),
  day: z.number().int().min(1).max(31).default(1).meta({ label: 'Day of Month' }),
  time: timeSchema,
  currentTime: z.boolean().default(false).meta({ label: 'Use Current Time' }),
  timeFormat: formatSchema.meta({ label: 'To Time Format' }),
  timeZone: timeZoneSchema,
});

export const nextDayOfYear = {
  slug: 'nextDayOfYear',
  label: 'Next Day of Year',
  description: 'Get the next occurrence of a month and day.',
  input,
  output: z.object({ result: z.string() }),
  idempotent: false,
  async run({ input: value }: PieceRunArgs<z.output<typeof input>, object, undefined>) {
    const now = dayjs().tz(value.timeZone);
    const selectedTime = value.currentTime ? now.format('HH:mm') : value.time;
    const { hours, minutes } = parseTime(selectedTime);
    const createOccurrence = (year: number, day: number) =>
      dayjs.tz(
        `${year}-${String(value.month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`,
        value.timeZone,
      );
    let result = createOccurrence(now.year(), value.day);

    if (!result.isValid() || result.format('M/D') !== `${value.month}/${value.day}`) {
      throw new Error(`Invalid calendar date: ${value.month}/${value.day}`);
    }

    if (result.isBefore(now)) {
      const nextYear = now.year() + 1;
      const lastDay = dayjs(`${nextYear}-${value.month}-01`).daysInMonth();

      result = createOccurrence(nextYear, Math.min(value.day, lastDay));
    }

    return { result: result.format(correctedFormat(value.timeFormat)) };
  },
};
