import { z } from 'zod';

import { calendarPath, dateTime, event, graphDateTime } from '../calendar.js';
import { signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { addresses } from '../mail.js';

function plus30Minutes(start: { dateTime: string; timeZone: string }) {
  const end = new Date(`${start.dateTime}Z`).getTime() + 30 * 60 * 1000;

  return { dateTime: new Date(end).toISOString().slice(0, 19), timeZone: start.timeZone };
}

export const createEvent = defineAction({
  slug: 'createEvent',
  description:
    'Create a calendar event. Attendees get an invitation. The end defaults to 30 minutes after the start.',
  input: z.object({
    calendarId: identifier.optional().meta({ description: 'Defaults to the main calendar.' }),
    subject: z.string(),
    start: dateTime,
    end: dateTime.optional(),
    timeZone: z.string().default('UTC').meta({
      description: 'Time zone for start and end without an offset, such as Europe/Paris.',
    }),
    location: z.string().optional(),
    body: z.string().optional(),
    bodyType: z.enum(['text', 'html']).default('text'),
    attendees: z.array(z.email()).optional(),
  }),
  output: event,
  idempotent: false,
  async run({ client, input, req }) {
    const start = graphDateTime(input.start, input.timeZone);

    return client.request(`${calendarPath(client.mailbox, input.calendarId)}/events`, event, {
      method: 'POST',
      body: {
        subject: input.subject,
        start,
        end: input.end ? graphDateTime(input.end, input.timeZone) : plus30Minutes(start),
        ...(input.location ? { location: { displayName: input.location } } : {}),
        ...(input.body ? { body: { contentType: input.bodyType, content: input.body } } : {}),
        ...(input.attendees?.length
          ? {
              attendees: addresses(input.attendees)?.map((attendee) => ({
                ...attendee,
                type: 'required',
              })),
            }
          : {}),
      },
      signal: signal(req),
    });
  },
});
