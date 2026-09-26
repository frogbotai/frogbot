import type { QuestionInteraction, TurnActor } from 'frogbot/pieces';

import { TelegramApiError, type TelegramBotClient } from '../client.js';
import type { TelegramMessageBody } from './keyboard.js';

export type TelegramTarget = { chat_id: string; message_thread_id?: number };

export function telegramTarget(threadId: string): TelegramTarget {
  const [, chatId = '', topic] = threadId.split(':');

  return { chat_id: chatId, ...(topic ? { message_thread_id: Number(topic) } : {}) };
}

export function telegramMessageId(messageId: string): number {
  return Number(messageId.split(':').at(-1));
}

export function postedAt(date: unknown): string {
  return typeof date === 'number' ? new Date(date * 1000).toISOString() : '';
}

export function responderName(interaction: QuestionInteraction): string {
  const author =
    interaction.type === 'message' ? interaction.message.author : interaction.event.user;

  return author.fullName || author.userName || author.userId;
}

export function actorName(actor: TurnActor | null): string | undefined {
  return actor?.channel?.name || actor?.channel?.username || undefined;
}

export async function editQuestionMessage({
  body,
  client,
  messageId,
  threadId,
}: {
  body: TelegramMessageBody;
  client: TelegramBotClient;
  messageId: string;
  threadId: string;
}): Promise<void> {
  const { chat_id } = telegramTarget(threadId);

  try {
    await client.call('editMessageText', {
      chat_id,
      message_id: telegramMessageId(messageId),
      ...body,
    });
  } catch (error) {
    const unchanged =
      error instanceof TelegramApiError && /message is not modified/i.test(error.description ?? '');

    if (!unchanged) throw error;
  }
}
