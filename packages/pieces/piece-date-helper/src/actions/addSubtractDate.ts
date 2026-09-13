import type { ManipulateType } from 'dayjs';
import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { correctedFormat, dayjs, formatSchema, parseDate, parseTime } from '../date.js';

const input = z.object({
  inputDate: z.string().meta({ label: 'Input Date' }),
  inputDateFormat: formatSchema.meta({ label: 'From Time Format' }),
  outputFormat: formatSchema.meta({ label: 'To Time Format' }),
  expression: z.string().meta({ label: 'Expression' }),
  timeZone: z.string().optional().meta({ label: 'Time Zone' }),
  setTime: z
    .string()
    .regex(/^\d\d:\d\d$/)
    .optional()
    .meta({ label: 'Set Time To' }),
  useCurrentTime: z.boolean().default(false).meta({ label: 'Use Current Time' }),
});

const expressionPattern = /([+-])\s*(\d+)\s*(years?|months?|days?|hours?|minutes?|seconds?)/gi;

export const addSubtractDate = {
  slug: 'addSubtractDate',
  label: 'Add or Subtract Time',
  description: 'Add or subtract date and time units from a date.',
  input,
  output: z.object({ result: z.string() }),
  idempotent: true,
  async run({ input: value }: PieceRunArgs<z.output<typeof input>, object, undefined>) {
    let result = value.timeZone
      ? dayjs.tz(value.inputDate, correctedFormat(value.inputDateFormat), value.timeZone)
      : parseDate(value.inputDate, value.inputDateFormat);

    if (!result.isValid()) {
      throw new Error(`Failed to parse the date: ${value.inputDate}`);
    }
    let matched = '';

    for (const match of value.expression.matchAll(expressionPattern)) {
      const [text, sign, amount, rawUnit] = match;

      if (!sign || !amount || !rawUnit) continue;

      matched += text.replaceAll(/\s/g, '');

      const unit = rawUnit.toLowerCase().replace(/s$/, '') as ManipulateType;
      const quantity = Number(amount) * (sign === '-' ? -1 : 1);

      if (value.timeZone) {
        const wallTime = dayjs(result.format('YYYY-MM-DD HH:mm:ss')).add(quantity, unit);

        result = dayjs.tz(wallTime.format('YYYY-MM-DD HH:mm:ss'), value.timeZone);
      } else {
        result = result.add(quantity, unit);
      }
    }

    const normalizedExpression = value.expression.replaceAll(/\s/g, '');

    if (!matched || matched !== normalizedExpression) {
      throw new Error(`Invalid date expression: ${value.expression}`);
    }

    if (value.timeZone && (value.setTime || value.useCurrentTime)) {
      const selectedTime = value.useCurrentTime
        ? dayjs().tz(value.timeZone).format('HH:mm')
        : value.setTime;

      if (selectedTime) {
        const { hours, minutes } = parseTime(selectedTime);

        const date = result.format('YYYY-MM-DD');

        result = dayjs.tz(`${date} ${hours}:${minutes}:00`, value.timeZone);
      }
    }

    return { result: result.format(correctedFormat(value.outputFormat)) };
  },
};
