import { type PiecePollingTrigger, type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { type DiscordClient, discordObject } from './client.js';
type PollInput = { limit: number } & Record<string, unknown>;
type PollArgs<T extends PollInput> = PieceRunArgs<T, object, DiscordClient> & { cursor?: number };

function pollingTrigger<TSchema extends z.ZodType<PollInput>>({
  slug,
  description,
  input,
  path,
  timestamp,
}: {
  slug: string;
  description: string;
  input: TSchema;
  path: (input: z.output<TSchema>) => string;
  timestamp: (item: Record<string, unknown>) => number;
}) {
  return {
    slug,
    description,
    type: 'polling',
    schedule: '*/1 * * * *',
    input,
    output: discordObject,
    sample: {},
    async run({ client, input: value, cursor }: PollArgs<z.output<TSchema>>) {
      const response = await client.request({ path: path(value) });
      const items = z.array(discordObject).parse(response.body);
      const ordered = items
        .map((item) => ({ item, timestamp: timestamp(item) }))
        .filter(({ timestamp: value }) => Number.isFinite(value))
        .sort((left, right) => left.timestamp - right.timestamp);
      const nextCursor = ordered.reduce(
        (latest, item) => Math.max(latest, item.timestamp),
        cursor ?? Number.NEGATIVE_INFINITY,
      );

      return {
        events:
          cursor === undefined
            ? []
            : ordered.filter((item) => item.timestamp > cursor).map(({ item }) => item),
        cursor: Number.isFinite(nextCursor) ? nextCursor : (cursor ?? Date.now()),
      };
    },
  } satisfies PiecePollingTrigger<TSchema, typeof discordObject, object, DiscordClient, number>;
}

const newMessageInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  channelId: z.string().min(1).meta({ label: 'Channel ID' }),
});

export const messageCreated = pollingTrigger({
  slug: 'messageCreated',
  description: 'Poll for messages newly created in a channel.',
  input: newMessageInput,
  path: ({ channelId, limit }) =>
    `/channels/${encodeURIComponent(channelId)}/messages?limit=${limit}`,
  timestamp: (message) => Date.parse(String(message.timestamp)),
});

const newMemberInput = z.object({
  limit: z.number().int().min(1).max(1000).default(50),
  guildId: z.string().min(1).meta({ label: 'Guild ID' }),
});

export const memberJoined = pollingTrigger({
  slug: 'memberJoined',
  description: 'Poll for members newly joined to a guild.',
  input: newMemberInput,
  path: ({ guildId, limit }) => `/guilds/${encodeURIComponent(guildId)}/members?limit=${limit}`,
  timestamp: (member) => Date.parse(String(member.joined_at)),
});
