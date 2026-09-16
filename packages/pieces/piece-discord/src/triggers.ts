import { type PieceAppTrigger, type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import { type DiscordClient, discordObject } from './client.js';

const triggerInput = z.object({});
const triggerOutput = discordObject;

function nonempty(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function deliveryKey(slug: string, delivery: Record<string, unknown>): string | undefined {
  const interactionId = nonempty(delivery.id);

  if (interactionId) return `${slug}:${interactionId}`;

  if (!delivery.data || typeof delivery.data !== 'object') return undefined;

  const data = delivery.data as Record<string, unknown>;

  if (slug === 'messageCreated') {
    const messageId = nonempty(data.id);

    return messageId ? `${slug}:${messageId}` : undefined;
  }

  if (slug !== 'reactionAdded' && slug !== 'reactionRemoved') return undefined;

  const messageId = nonempty(data.message_id);
  const userId = nonempty(data.user_id);
  const emoji =
    data.emoji && typeof data.emoji === 'object'
      ? (data.emoji as Record<string, unknown>)
      : undefined;
  const emojiId = nonempty(emoji?.id);
  const emojiName = nonempty(emoji?.name);
  const emojiKey = emojiId ?? emojiName;

  return messageId && userId && emojiKey ? `${slug}:${messageId}:${userId}:${emojiKey}` : undefined;
}

function appTrigger(slug: string, description: string) {
  return {
    slug,
    description,
    type: 'app',
    event: slug,
    input: triggerInput,
    output: triggerOutput,
    sample: {},
    async run({ req }: PieceRunArgs<object, object, DiscordClient>) {
      const delivery = discordObject.parse(req.data);
      const dedupeKey = deliveryKey(slug, delivery);

      if (!dedupeKey) return [];

      return [{ data: delivery, dedupeKey }];
    },
  } satisfies PieceAppTrigger<typeof triggerInput, typeof triggerOutput, object, DiscordClient>;
}

export const commandReceived = appTrigger(
  'commandReceived',
  'Run when the bot receives a slash command interaction.',
);
export const componentReceived = appTrigger(
  'componentReceived',
  'Run when a user interacts with a Discord message component.',
);
export const messageCreated = appTrigger(
  'messageCreated',
  'Run when the Gateway receives a newly created message.',
);
export const reactionAdded = appTrigger(
  'reactionAdded',
  'Run when the Gateway receives a reaction addition.',
);
export const reactionRemoved = appTrigger(
  'reactionRemoved',
  'Run when the Gateway receives a reaction removal.',
);
