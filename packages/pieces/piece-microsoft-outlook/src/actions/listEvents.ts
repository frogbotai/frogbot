import { z } from 'zod';

import { calendarPath, event } from '../calendar.js';
import { signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { listOutput, listPage, pageInput } from '../pagination.js';

export const listEvents = defineAction({
  slug: 'listEvents',
  description:
    'List one page of events between start and end, earliest first, with each recurring occurrence as its own event.',
  input: z.object({
    calendarId: identifier.optional().meta({ description: 'Defaults to the main calendar.' }),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    ...pageInput,
  }),
  output: listOutput(event),
  idempotent: true,
  async run({ client, input, req }) {
    return listPage(client, event, {
      path: `${calendarPath(client.mailbox, input.calendarId)}/calendarView`,
      query: {
        startDateTime: new Date(input.start).toISOString(),
        endDateTime: new Date(input.end).toISOString(),
        $orderby: 'start/dateTime',
      },
      headers: { Prefer: 'outlook.timezone="UTC"' },
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});
