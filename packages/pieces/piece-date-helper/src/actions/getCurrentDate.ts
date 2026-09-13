import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { correctedFormat, dayjs, formatSchema, timeZoneSchema } from '../date.js';

const input = z.object({ timeFormat: formatSchema, timeZone: timeZoneSchema });

export const getCurrentDate = {
  slug: 'getCurrentDate',
  label: 'Get Current Date',
  description: 'Get the current date.',
  input,
  output: z.object({ result: z.string() }),
  idempotent: false,
  async run({ input: value }: PieceRunArgs<z.output<typeof input>, object, undefined>) {
    return { result: dayjs().tz(value.timeZone).format(correctedFormat(value.timeFormat)) };
  },
};
