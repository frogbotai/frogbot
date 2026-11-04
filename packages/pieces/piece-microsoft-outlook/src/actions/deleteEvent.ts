import { z } from 'zod';

import { MicrosoftGraphError, signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';

export const deleteEvent = defineAction({
  slug: 'deleteEvent',
  description:
    'Delete a calendar event. An event that is already gone counts as deleted, with found false.',
  input: z.object({ eventId: identifier }),
  output: z.object({ eventId: z.string(), found: z.boolean() }),
  idempotent: true,
  async run({ client, input, req }) {
    try {
      await client.request(
        `${client.mailbox}/events/${encodeURIComponent(input.eventId)}`,
        z.unknown(),
        { method: 'DELETE', signal: signal(req) },
      );
    } catch (error) {
      if (error instanceof MicrosoftGraphError && error.status === 404) {
        return { eventId: input.eventId, found: false };
      }

      throw error;
    }

    return { eventId: input.eventId, found: true };
  },
});
