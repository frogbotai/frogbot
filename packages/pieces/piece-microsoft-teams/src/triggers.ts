import type { PieceJSON } from 'frogbot/pieces';
import { z } from 'zod';

import { signal } from './client.js';
import { identifier } from './config.js';
import { defineAppTrigger, definePollingTrigger } from './define.js';
import { channel, chat, message } from './schemas.js';

const cursorSchema = z.object({ since: z.string(), deltaLink: z.string().optional() });

type Cursor = z.output<typeof cursorSchema>;

function readCursor(cursor: PieceJSON | undefined): Cursor | undefined {
  const parsed = cursorSchema.safeParse(cursor);

  return parsed.success ? parsed.data : undefined;
}

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

const newChannelInput = z.object({ teamId: identifier });

export const channelCreated = definePollingTrigger({
  slug: 'channelCreated',
  description: 'Emit channels created in a selected team.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: newChannelInput,
  output: channel,
  async run({ client, input, cursor: stored, req }) {
    const cursor = readCursor(stored);

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
});

const newChannelMessageInput = z.object({ teamId: identifier, channelId: identifier });

export const channelMessageCreated = definePollingTrigger({
  slug: 'channelMessageCreated',
  description: 'Emit messages posted in a selected channel.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: newChannelMessageInput,
  output: message,
  async run({ client, input, cursor: stored, req }) {
    const cursor = readCursor(stored);

    const root = `/v1.0/teams/${encodeURIComponent(input.teamId)}/channels/${encodeURIComponent(input.channelId)}/messages`;
    const requestPath = cursor?.deltaLink ?? (cursor ? `${root}/delta` : root);
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
    const nextCursor: PieceJSON = deltaLink ? { since, deltaLink } : { since };

    return { events, cursor: nextCursor };
  },
});

const noInput = z.object({});

export const chatCreated = definePollingTrigger({
  slug: 'chatCreated',
  description: 'Emit chats created for the authenticated user.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: noInput,
  output: chat,
  async run({ client, cursor: stored, req }) {
    const cursor = readCursor(stored);

    const query: Record<string, string | number> = {};

    if (cursor) query['$filter'] = `createdDateTime gt ${cursor.since}`;
    else query['$top'] = 10;

    const values = await client.list('/v1.0/chats', chat, { query, signal: signal(req) });
    const events = after(values, cursor?.since);
    const since = newest(values, cursor?.since ?? new Date(0).toISOString());

    return { events, cursor: { since } };
  },
});

const newChatMessageInput = z.object({ chatId: identifier });

export const chatMessageCreated = definePollingTrigger({
  slug: 'chatMessageCreated',
  description: 'Emit messages received in a selected chat.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: newChatMessageInput,
  output: message,
  async run({ client, input, cursor: stored, req }) {
    const cursor = readCursor(stored);

    const root = `/v1.0/chats/${encodeURIComponent(input.chatId)}/messages`;
    const requestPath = cursor?.deltaLink ?? (cursor ? `${root}/delta` : root);
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
    const nextCursor: PieceJSON = deltaLink ? { since, deltaLink } : { since };

    return { events, cursor: nextCursor };
  },
});

const activity = z.record(z.string(), z.unknown());

function activityTrigger<const TSlug extends string>(slug: TSlug, description: string) {
  return defineAppTrigger({
    slug,
    description,
    type: 'app',
    event: slug,
    input: z.object({}),
    output: activity,
    async run({ req }) {
      const parsed = activity.parse(req.data);
      const dedupeKey = typeof parsed.id === 'string' ? parsed.id.trim() : '';

      if (!dedupeKey) return [];

      return [{ data: parsed, dedupeKey }];
    },
  });
}

export const messageReceived = activityTrigger(
  'messageReceived',
  'Emit a Bot Framework message activity received by the bot.',
);
export const messageReactionReceived = activityTrigger(
  'messageReactionReceived',
  'Emit a Bot Framework message reaction activity received by the bot.',
);
export const cardActionReceived = activityTrigger(
  'cardActionReceived',
  'Emit an Adaptive Card action received by the bot.',
);
export const conversationUpdated = activityTrigger(
  'conversationUpdated',
  'Emit a Bot Framework conversation update received by the bot.',
);
export const installationUpdated = activityTrigger(
  'installationUpdated',
  'Emit a Teams app installation update received by the bot.',
);
export const dialogOpened = activityTrigger(
  'dialogOpened',
  'Emit a Teams dialog open activity received by the bot.',
);
export const dialogSubmitted = activityTrigger(
  'dialogSubmitted',
  'Emit a Teams dialog submission received by the bot.',
);

export const microsoftTeamsTriggerDefinitions = [
  channelMessageCreated,
  channelCreated,
  chatCreated,
  chatMessageCreated,
  messageReceived,
  messageReactionReceived,
  cardActionReceived,
  conversationUpdated,
  installationUpdated,
  dialogOpened,
  dialogSubmitted,
];
