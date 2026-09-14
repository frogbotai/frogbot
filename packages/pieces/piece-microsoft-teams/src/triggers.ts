import type { PiecePollingTrigger, PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { MicrosoftTeamsClient } from './client.js';
import { signal } from './client.js';
import { identifier } from './config.js';
import { channels, chats, teams } from './options.js';
import { channel, chat, message } from './schemas.js';

type Cursor = { since: string } | { since: string; deltaLink: string };
type Poll<T extends z.ZodType> = PieceRunArgs<z.output<T>, object, MicrosoftTeamsClient> & {
  cursor?: Cursor;
};

function newest(values: { createdDateTime?: string | null }[], fallback: string) {
  return values.reduce((latest, value) => {
    if (!value.createdDateTime) return latest;

    return Date.parse(value.createdDateTime) > Date.parse(latest) ? value.createdDateTime : latest;
  }, fallback);
}

function after<T extends { createdDateTime?: string | null }>(values: T[], since?: string) {
  if (!since) return values;

  return values.filter(
    (value) => value.createdDateTime && Date.parse(value.createdDateTime) > Date.parse(since),
  );
}

function cursorDeltaLink(cursor?: Cursor) {
  return cursor && 'deltaLink' in cursor ? cursor.deltaLink : undefined;
}

const newChannelInput = z.object({ teamId: identifier });

export const channelCreated: PiecePollingTrigger<
  typeof newChannelInput,
  typeof channel,
  object,
  MicrosoftTeamsClient,
  Cursor
> & { options: { teamId: typeof teams } } = {
  slug: 'channelCreated',
  description: 'Emit channels created in a selected team.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: newChannelInput,
  output: channel,
  options: { teamId: teams },
  async run({ client, input, cursor, req }: Poll<typeof newChannelInput>) {
    const query: Record<string, string | number> = {};

    if (cursor) query['$filter'] = `createdDateTime gt ${cursor.since}`;

    const values = await client.list(
      `/v1.0/teams/${encodeURIComponent(input.teamId)}/channels`,
      channel,
      {
        query,
        signal: signal(req),
      },
    );
    const events = after(values, cursor?.since);
    const since = newest(values, cursor?.since ?? new Date(0).toISOString());

    return { events, cursor: { since } };
  },
};

const newChannelMessageInput = z.object({ teamId: identifier, channelId: identifier });

export const channelMessageCreated: PiecePollingTrigger<
  typeof newChannelMessageInput,
  typeof message,
  object,
  MicrosoftTeamsClient,
  Cursor
> & { options: { teamId: typeof teams; channelId: typeof channels } } = {
  slug: 'channelMessageCreated',
  description: 'Emit messages posted in a selected channel.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: newChannelMessageInput,
  output: message,
  options: { teamId: teams, channelId: channels },
  async run({ client, input, cursor, req }: Poll<typeof newChannelMessageInput>) {
    const root = `/v1.0/teams/${encodeURIComponent(input.teamId)}/channels/${encodeURIComponent(input.channelId)}/messages`;
    const requestPath = cursorDeltaLink(cursor) ?? (cursor ? `${root}/delta` : root);
    const result = await client.page(
      requestPath,
      message,
      cursor
        ? { signal: signal(req) }
        : {
            query: { $top: 5 },
            signal: signal(req),
          },
    );
    const values = [...result.value];
    let next = result['@odata.nextLink'];
    let deltaLink = result['@odata.deltaLink'];

    while (next) {
      const page = await client.page(next, message, { signal: signal(req) });

      values.push(...page.value);
      next = page['@odata.nextLink'];
      deltaLink = page['@odata.deltaLink'] ?? deltaLink;
    }

    const events = after(values, cursor?.since);
    const since = newest(values, cursor?.since ?? new Date(0).toISOString());
    const nextCursor = deltaLink ? { since, deltaLink } : { since };

    return { events, cursor: nextCursor };
  },
};

const noInput = z.object({});

export const chatCreated: PiecePollingTrigger<
  typeof noInput,
  typeof chat,
  object,
  MicrosoftTeamsClient,
  Cursor
> = {
  slug: 'chatCreated',
  description: 'Emit chats created for the authenticated user.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: noInput,
  output: chat,
  async run({ client, cursor, req }: Poll<typeof noInput>) {
    const query: Record<string, string | number> = {};

    if (cursor) query['$filter'] = `createdDateTime gt ${cursor.since}`;
    else query['$top'] = 10;

    const values = await client.list('/v1.0/chats', chat, { query, signal: signal(req) });
    const events = after(values, cursor?.since);
    const since = newest(values, cursor?.since ?? new Date(0).toISOString());

    return { events, cursor: { since } };
  },
};

const newChatMessageInput = z.object({ chatId: identifier });

export const chatMessageCreated: PiecePollingTrigger<
  typeof newChatMessageInput,
  typeof message,
  object,
  MicrosoftTeamsClient,
  Cursor
> & { options: { chatId: typeof chats } } = {
  slug: 'chatMessageCreated',
  description: 'Emit messages received in a selected chat.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: newChatMessageInput,
  output: message,
  options: { chatId: chats },
  async run({ client, input, cursor, req }: Poll<typeof newChatMessageInput>) {
    const root = `/v1.0/chats/${encodeURIComponent(input.chatId)}/messages`;
    const requestPath = cursorDeltaLink(cursor) ?? (cursor ? `${root}/delta` : root);
    const result = await client.page(
      requestPath,
      message,
      cursor
        ? { signal: signal(req) }
        : {
            query: { $top: 5 },
            signal: signal(req),
          },
    );
    const values = [...result.value];
    let next = result['@odata.nextLink'];
    let deltaLink = result['@odata.deltaLink'];

    while (next) {
      const page = await client.page(next, message, { signal: signal(req) });

      values.push(...page.value);
      next = page['@odata.nextLink'];
      deltaLink = page['@odata.deltaLink'] ?? deltaLink;
    }

    const events = after(values, cursor?.since);
    const since = newest(values, cursor?.since ?? new Date(0).toISOString());
    const nextCursor = deltaLink ? { since, deltaLink } : { since };

    return { events, cursor: nextCursor };
  },
};

export const microsoftTeamsTriggerDefinitions = [
  channelMessageCreated,
  channelCreated,
  chatCreated,
  chatMessageCreated,
];
