import type { QuestionInteraction } from 'frogbot/pieces';

import type { SlackClient } from '../client.js';

export function slackThread(threadId: string): { channel: string; threadTs?: string } {
  const [, channel = '', threadTs] = threadId.split(':');

  return { channel, ...(threadTs ? { threadTs } : {}) };
}

export function interactionUserId(interaction: QuestionInteraction): string {
  return interaction.type === 'message'
    ? interaction.message.author.userId
    : interaction.event.user.userId;
}

export async function postEphemeral({
  client,
  interaction,
  text,
  threadId,
}: {
  client: SlackClient;
  interaction: QuestionInteraction;
  text: string;
  threadId: string;
}): Promise<void> {
  const { channel, threadTs } = slackThread(threadId);

  await client.request('chat.postEphemeral', {
    channel,
    user: interactionUserId(interaction),
    text,
    ...(threadTs ? { thread_ts: threadTs } : {}),
  });
}
