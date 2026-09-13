import dayjs from 'dayjs';
import advancedFormat from 'dayjs/plugin/advancedFormat.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import duration from 'dayjs/plugin/duration.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { z } from 'zod';

dayjs.extend(customParseFormat);
dayjs.extend(advancedFormat);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(duration);

export const defaultFormat = 'DDD MMM DD YYYY HH:mm:ss';
export const formatSchema = z.string().default(defaultFormat).meta({ label: 'Time Format' });
export const timeZoneSchema = z.string().default('UTC').meta({ label: 'Time Zone' });
export const timeSchema = z
  .string()
  .regex(/^\d\d:\d\d$/)
  .default('00:00')
  .meta({ label: '24h Time' });
export const units = ['year', 'month', 'day', 'hour', 'minute', 'second'] as const;
export const extractUnits = [...units, 'dayOfWeek', 'monthName'] as const;

export function correctedFormat(format: string) {
  return format.replaceAll('DDDD', 'dddd').replaceAll('DDD', 'ddd');
}

export function parseDate(value: string, format: string) {
  const corrected = correctedFormat(format);
  let parsed = dayjs(value, corrected, true);

  if (!parsed.isValid()) parsed = dayjs(value, corrected, false);

  if (!parsed.isValid()) parsed = dayjs(value);

  if (!parsed.isValid()) {
    throw new Error(`Failed to parse the date: ${value} with format: ${corrected}`);
  }

  return parsed;
}

export function parseTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);

  if (hours === undefined || minutes === undefined || hours > 23 || minutes > 59) {
    throw new Error(`Invalid time: ${value}. Expected a 24-hour time from 00:00 to 23:59.`);
  }

  return { hours, minutes };
}

export { dayjs };
