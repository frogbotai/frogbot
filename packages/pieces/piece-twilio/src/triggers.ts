import { z } from 'zod';

import type { TwilioClient } from './client.js';
import { definePollingTrigger } from './define.js';

const output = z.looseObject({ sid: z.string(), date_created: z.string() });
const emptyInput = z.object({});
const cursorSchema = z.object({ date: z.number(), sid: z.string() });

type Cursor = z.output<typeof cursorSchema>;

type Resource = z.output<typeof output>;

function compare(item: Record<string, unknown>, cursor: Cursor) {
  const date = new Date(String(item.date_created)).getTime();
  const sid = String(item.sid);

  return date - cursor.date || sid.localeCompare(cursor.sid);
}

async function listAll({
  client,
  path,
  key,
  query,
}: {
  client: TwilioClient;
  path: string;
  key: string;
  query?: Record<string, unknown>;
}) {
  const items: Resource[] = [];
  let next: string | null = path;

  while (next) {
    const body = (await client.request({ path: next, query })) as Record<string, unknown>;

    if (Array.isArray(body[key])) items.push(...(body[key] as Resource[]));

    next = typeof body.next_page_uri === 'string' ? body.next_page_uri : null;
    query = undefined;
  }

  return items;
}

function pollingTrigger<const TSlug extends string>({
  slug,
  description,
  resource,
  key,
  completed,
}: {
  slug: TSlug;
  description: string;
  resource: string;
  key: string;
  completed?: boolean;
}) {
  return definePollingTrigger({
    slug,
    description,
    type: 'polling',
    schedule: '*/5 * * * *',
    input: emptyInput,
    output,
    async run({ client, cursor }) {
      const previous = cursorSchema.safeParse(cursor).data;

      const items = await listAll({
        client,
        path: `/2010-04-01/Accounts/${client.accountSid}/${resource}.json`,
        key,
        query: { PageSize: 1000 },
      });

      const eligible = items.filter((item) => {
        if (completed && item.status !== 'completed') return false;

        return true;
      });

      const sorted = eligible.sort((left, right) =>
        compare(left, {
          date: new Date(String(right.date_created)).getTime(),
          sid: String(right.sid),
        }),
      );

      const newest = sorted.at(-1);
      const nextCursor = newest
        ? { date: new Date(String(newest.date_created)).getTime(), sid: String(newest.sid) }
        : previous;

      return {
        events: previous ? sorted.filter((item) => compare(item, previous) > 0) : [],
        cursor: nextCursor,
      };
    },
  });
}

export const incomingSms = definePollingTrigger({
  slug: 'incomingSms',
  description: 'Emit newly received inbound SMS messages',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object({ phoneNumber: z.string().min(1) }),
  output,
  async run({ client, input, cursor }) {
    const previous = cursorSchema.safeParse(cursor).data;

    const items = await listAll({
      client,
      path: `/2010-04-01/Accounts/${client.accountSid}/Messages.json`,
      key: 'messages',
      query: { PageSize: 1000, To: input.phoneNumber },
    });

    const messages = items
      .filter((message) => {
        if (message.direction !== 'inbound') return false;

        return true;
      })
      .sort((left, right) =>
        compare(left, {
          date: new Date(String(right.date_created)).getTime(),
          sid: String(right.sid),
        }),
      );

    const newest = messages.at(-1);

    return {
      events: previous ? messages.filter((message) => compare(message, previous) > 0) : [],
      cursor: newest
        ? { date: new Date(String(newest.date_created)).getTime(), sid: String(newest.sid) }
        : previous,
    };
  },
});

export const phoneNumberAdded = pollingTrigger({
  slug: 'phoneNumberAdded',
  description: 'Emit newly added incoming phone numbers',
  resource: 'IncomingPhoneNumbers',
  key: 'incoming_phone_numbers',
});
export const recordingCompleted = pollingTrigger({
  slug: 'recordingCompleted',
  description: 'Emit newly completed call recordings',
  resource: 'Recordings',
  key: 'recordings',
});
export const transcriptionCompleted = pollingTrigger({
  slug: 'transcriptionCompleted',
  description: 'Emit newly completed recording transcriptions',
  resource: 'Transcriptions',
  key: 'transcriptions',
  completed: true,
});
export const callCompleted = pollingTrigger({
  slug: 'callCompleted',
  description: 'Emit newly completed incoming and outgoing calls',
  resource: 'Calls',
  key: 'calls',
  completed: true,
});
