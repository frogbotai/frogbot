import { z } from 'zod';

import { correctedFormat, dayjs, formatSchema, timeZoneSchema } from '../date.js';
import { defineAction } from '../define.js';

const input = z.object({ timeFormat: formatSchema, timeZone: timeZoneSchema });

export const getCurrentDate = defineAction({
  slug: 'getCurrentDate',
  label: 'Get Current Date',
  description: 'Get the current date.',
  input,
  output: z.object({ result: z.string() }),
  idempotent: false,
  async run({ input: value }) {
    return { result: dayjs().tz(value.timeZone).format(correctedFormat(value.timeFormat)) };
  },
});
