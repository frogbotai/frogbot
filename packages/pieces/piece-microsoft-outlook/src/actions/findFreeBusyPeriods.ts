import { z } from 'zod';

import { dateTime, graphDateTime } from '../calendar.js';
import { MicrosoftGraphError, signal } from '../client.js';
import { defineAction } from '../define.js';

const slot = z.object({ dateTime: z.string(), timeZone: z.string().nullish() });

const schedule = z
  .object({
    scheduleId: z.string(),
    availabilityView: z.string().nullish(),
    scheduleItems: z
      .array(
        z
          .object({ status: z.string(), start: slot, end: slot, subject: z.string().nullish() })
          .passthrough(),
      )
      .nullish(),
    workingHours: z.object({}).passthrough().nullish(),
    error: z
      .object({ message: z.string().nullish(), responseCode: z.string().nullish() })
      .nullish(),
  })
  .passthrough();

export const findFreeBusyPeriods = defineAction({
  slug: 'findFreeBusyPeriods',
  description:
    "Find people's busy periods within a time range; gaps between them are free. Work or school accounts only.",
  input: z.object({
    emails: z.array(z.email()).min(1).max(100),
    start: dateTime,
    end: dateTime,
    timeZone: z.string().default('UTC'),
    intervalMinutes: z.number().int().min(5).max(1440).default(30),
  }),
  output: z.array(schedule),
  idempotent: true,
  async run({ client, input, req }) {
    try {
      return (
        await client.page(`${client.mailbox}/calendar/getSchedule`, schedule, {
          method: 'POST',
          body: {
            schedules: input.emails,
            startTime: graphDateTime(input.start, input.timeZone),
            endTime: graphDateTime(input.end, input.timeZone),
            availabilityViewInterval: input.intervalMinutes,
          },
          signal: signal(req),
        })
      ).value;
    } catch (error) {
      if (
        error instanceof MicrosoftGraphError &&
        client.mailbox === '/me' &&
        (await client
          .page('/organization', z.object({ id: z.string() }), {
            query: { $select: 'id' },
            signal: signal(req),
          })
          .then(({ value }) => value.length === 0)
          .catch(() => true))
      ) {
        throw new Error('Microsoft Outlook free/busy needs a work or school account.', {
          cause: error,
        });
      }

      throw error;
    }
  },
});
