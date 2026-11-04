import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';

const calendar = z
  .object({
    id: z.string(),
    name: z.string().nullish(),
    isDefaultCalendar: z.boolean().nullish(),
    canEdit: z.boolean().nullish(),
    owner: z.object({ name: z.string().nullish(), address: z.string().nullish() }).nullish(),
  })
  .passthrough();

export const listCalendars = defineAction({
  slug: 'listCalendars',
  description: 'List every calendar in the mailbox.',
  input: z.object({}),
  output: z.array(calendar),
  idempotent: true,
  async run({ client, req }) {
    return client.list(`${client.mailbox}/calendars`, calendar, { signal: signal(req) });
  },
});
