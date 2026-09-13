import { z } from 'zod';

import {
  correctedFormat,
  dayjs,
  formatSchema,
  parseTime,
  timeSchema,
  timeZoneSchema,
} from '../date.js';

export const previousMonthInput = z.object({
  time: timeSchema,
  currentTime: z.boolean().default(false).meta({ label: 'Use Current Time' }),
  timeFormat: formatSchema.meta({ label: 'To Time Format' }),
  timeZone: timeZoneSchema,
});

export async function previousMonthBoundary(
  value: z.output<typeof previousMonthInput>,
  boundary: 'startOf' | 'endOf',
) {
  const now = dayjs().tz(value.timeZone);
  const selectedTime = value.currentTime ? now.format('HH:mm') : value.time;
  const { hours, minutes } = parseTime(selectedTime);
  const previousMonth = now.subtract(1, 'month');
  const day =
    boundary === 'startOf'
      ? 1
      : new Date(Date.UTC(previousMonth.year(), previousMonth.month() + 1, 0)).getUTCDate();
  const wallTime = `${previousMonth.year()}-${String(previousMonth.month() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  const result = dayjs.tz(wallTime, value.timeZone);

  return { result: result.format(correctedFormat(value.timeFormat)) };
}
