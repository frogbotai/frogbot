import type { QuestionInteraction } from 'frogbot/pieces';

import type { DiscordClient } from '../client.js';

export function discordChannelId(threadId: string): string {
  const [, , channelId = '', threadChannelId] = threadId.split(':');

  return encodeURIComponent(threadChannelId || channelId);
}

export function interactionUserId(interaction: QuestionInteraction): string {
  return interaction.type === 'message'
    ? interaction.message.author.userId
    : interaction.event.user.userId;
}

export async function postNotice({
  client,
  interaction,
  messageId,
  text,
  threadId,
}: {
  client: DiscordClient;
  interaction: QuestionInteraction;
  messageId: string;
  text: string;
  threadId: string;
}): Promise<void> {
  const userId = interactionUserId(interaction);
  const replyTo = interaction.type === 'message' ? interaction.message.id : messageId;

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
