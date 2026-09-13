import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { correctedFormat, formatSchema, parseDate, timeZoneSchema } from '../date.js';

const input = z.object({
  inputDate: z.string().meta({ label: 'Input Date' }),
  inputFormat: formatSchema.meta({ label: 'From Time Format' }),
  inputTimeZone: timeZoneSchema.meta({ label: 'From Time Zone' }),
  outputFormat: formatSchema.meta({ label: 'To Time Format' }),
  outputTimeZone: timeZoneSchema.meta({ label: 'To Time Zone' }),
});

export const formatDate = {
  slug: 'formatDate',
  label: 'Format Date',
  description: 'Convert a date from one format and time zone to another.',
  input,
  output: z.object({ result: z.string() }),
  idempotent: true,
  async run({ input: value }: PieceRunArgs<z.output<typeof input>, object, undefined>) {
    const parsed = parseDate(value.inputDate, value.inputFormat);
    const result = parsed
      .tz(value.inputTimeZone, true)
      .tz(value.outputTimeZone)
      .format(correctedFormat(value.outputFormat));

    return { result };
  },
};
