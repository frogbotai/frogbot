import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { TwilioClient } from './client.js';

const output = z.looseObject({ sid: z.string(), date_created: z.string() });
const emptyInput = z.object({});
type Cursor = { date: number; sid: string };
type Args = PieceRunArgs<Record<string, never>, object, TwilioClient> & { cursor?: Cursor };

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
  const items: Record<string, unknown>[] = [];
  let next: string | null = path;

  while (next) {
    const body = (await client.request({ path: next, query })) as Record<string, unknown>;

    if (Array.isArray(body[key])) items.push(...(body[key] as Record<string, unknown>[]));

    next = typeof body.next_page_uri === 'string' ? body.next_page_uri : null;
    query = undefined;
  }

  return items;
}

function pollingTrigger({
  slug,
  description,
  resource,
  key,
  completed,
}: {
  slug: string;
  description: string;
  resource: string;
  key: string;
  completed?: boolean;
}) {
  return {
    slug,
    description,
    type: 'polling' as const,
    schedule: '*/5 * * * *',
    input: emptyInput,
    output,
    async run({ client, cursor }: Args) {
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
        : cursor;

      return {
        events: cursor ? sorted.filter((item) => compare(item, cursor) > 0) : [],
        cursor: nextCursor,
      };
    },
  };
}

export const incomingSms = {
  ...pollingTrigger({
    slug: 'incomingSms',
    description: 'Emit newly received inbound SMS messages',
    resource: 'Messages',
    key: 'messages',
  }),
  input: z.object({ phoneNumber: z.string().min(1) }),
  async run({ client, input, cursor }: Args & { input: { phoneNumber: string } }) {
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
      events: cursor ? messages.filter((message) => compare(message, cursor) > 0) : [],
      cursor: newest
        ? { date: new Date(String(newest.date_created)).getTime(), sid: String(newest.sid) }
        : cursor,
    };
  },
};

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
