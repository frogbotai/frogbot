import { z } from 'zod';

import type { MicrosoftOutlookClient } from '../client.js';
import { type Message, message } from '../mail.js';

/** The newest `receivedDateTime` seen, and the ids of the messages received at that instant. */
export type MailCursor = { since: string; ids: string[] };

export const mailCursor = z.object({ since: z.string(), ids: z.array(z.string()) });

/**
 * Messages in a folder received since the cursor, oldest first, with the next cursor. With no
 * cursor it returns none and a cursor at now.
 */
export async function pollFolder(
  client: MicrosoftOutlookClient,
  args: { folderId: string; cursor: unknown; filter?: string; signal?: AbortSignal },
): Promise<{ messages: Message[]; cursor: MailCursor }> {
  const previous = mailCursor.safeParse(args.cursor);

  if (!previous.success) {
    return { messages: [], cursor: { since: new Date().toISOString(), ids: [] } };
  }

  const { since, ids } = previous.data;
  const seen = new Set(ids);
  const found = await client.list(
    `${client.mailbox}/mailFolders/${encodeURIComponent(args.folderId)}/messages`,
    message,
    {
      query: {
        $filter: [`receivedDateTime ge ${since}`, args.filter].filter(Boolean).join(' and '),
        $orderby: 'receivedDateTime desc',
        $top: 50,
      },
      signal: args.signal,
    },
  );

  const sinceTime = Date.parse(since);
  const messages = found
    .filter((item) => {
      const received = Date.parse(item.receivedDateTime ?? '');

      return received > sinceTime || (received === sinceTime && !seen.has(item.id));
    })
    .reverse();

  const newest = messages.at(-1)?.receivedDateTime;

  if (!newest) return { messages, cursor: previous.data };

  const newestTime = Date.parse(newest);
  const atNewest = messages
    .filter((item) => Date.parse(item.receivedDateTime ?? '') === newestTime)
    .map((item) => item.id);

  return {
    messages,
    cursor: {
      since: new Date(newestTime).toISOString(),
      ids: newestTime === sinceTime ? [...ids, ...atNewest] : atNewest,
    },
  };
}

function matches(value: string | null | undefined, wanted: string) {
  return value?.toLowerCase() === wanted.toLowerCase();
}

export function fromSender(item: Message, sender?: string) {
  return !sender || matches(item.from?.emailAddress?.address, sender);
}

export function toRecipient(item: Message, recipient?: string) {
  return (
    !recipient ||
    [...(item.toRecipients ?? []), ...(item.ccRecipients ?? [])].some((entry) =>
      matches(entry.emailAddress?.address, recipient),
    )
  );
}
