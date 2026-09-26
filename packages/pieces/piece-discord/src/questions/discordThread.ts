import type { QuestionInteraction, QuestionRecord } from 'frogbot/pieces';

import type { DiscordClient } from '../client.js';

export function discordChannelId(threadId: string): string {
  const [, , channelId = '', threadChannelId] = threadId.split(':');

  return encodeURIComponent(threadChannelId || channelId);
}

export function cardPath({
  question,
  threadId,
}: {
  question: QuestionRecord;
  threadId: string;
}): string {
  return `/channels/${discordChannelId(threadId)}/messages/${encodeURIComponent(cardId(question))}`;
}

export function cardId(question: QuestionRecord): string {
  return question.messages.at(-1)!.id;
}

export function postedAt(timestamp: unknown): string {
  const at = typeof timestamp === 'string' ? Date.parse(timestamp) : Number.NaN;

  return Number.isFinite(at) ? new Date(at).toISOString() : '';
}

export function interactionUserId(interaction: QuestionInteraction): string {
  return interaction.type === 'message'
    ? interaction.message.author.userId
    : interaction.event.user.userId;
}

export async function postNotice({
  client,
  interaction,
  question,
  text,
  threadId,
}: {
  client: DiscordClient;
  interaction: QuestionInteraction;
  question: QuestionRecord;
  text: string;
  threadId: string;
}): Promise<void> {
  const userId = interactionUserId(interaction);
  const replyTo = interaction.type === 'message' ? interaction.message.id : cardId(question);

  await client.request({
    method: 'POST',
    path: `/channels/${discordChannelId(threadId)}/messages`,
    body: {
      content: `<@${userId}> ${text}`,
      allowed_mentions: { users: [userId] },
      message_reference: { message_id: replyTo, fail_if_not_exists: false },
    },
  });
}
