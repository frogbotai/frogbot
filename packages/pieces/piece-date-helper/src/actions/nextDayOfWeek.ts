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
  weekday: z.number().int().min(0).max(6).meta({ label: 'Weekday' }),
  time: timeSchema,
  currentTime: z.boolean().default(false).meta({ label: 'Use Current Time' }),
  timeFormat: formatSchema.meta({ label: 'To Time Format' }),
  timeZone: timeZoneSchema,
});

export const nextDayOfWeek = {
  slug: 'nextDayOfWeek',
  label: 'Next Day of Week',
  description: 'Get the next occurrence of a weekday.',
  input,
  output: z.object({ result: z.string() }),
  idempotent: false,
  async run({ input: value }: PieceRunArgs<z.output<typeof input>, object, undefined>) {
    const now = dayjs().tz(value.timeZone);
    const selectedTime = value.currentTime ? now.format('HH:mm') : value.time;
    const { hours, minutes } = parseTime(selectedTime);
    let result = now.hour(hours).minute(minutes).second(0).millisecond(0);
    let days = value.weekday - result.day();

    if (days < 0 || (days === 0 && result.isBefore(now))) days += 7;

    result = result.add(days, 'day');

    return { result: result.format(correctedFormat(value.timeFormat)) };
  },
};
