import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { TelegramBotClient } from '../client.js';
import { questionMessage } from './keyboard.js';
import { initialState } from './state.js';
import { postedAt, telegramTarget } from './telegramThread.js';

type SentMessage = { message_id?: unknown; date?: unknown; chat?: { id?: unknown } };

export const renderTelegramQuestion: PieceChannelQuestions<TelegramBotClient>['render'] = async ({
  calls,
  client,
  thread,
}) => {
  const [call] = calls;

  if (!call) return [];

  const target = telegramTarget(thread.id);
  const state = initialState();

  const response = await client.call('sendMessage', {
    ...target,
    ...questionMessage({ call, state }),
  });

  const sent = response.result as SentMessage | undefined;

  if (typeof sent?.message_id !== 'number') {
    throw new Error('Telegram sendMessage did not return a message id.');
  }

  const id = `${String(sent.chat?.id ?? target.chat_id)}:${sent.message_id}`;

  return [{ calls: [call.toolCallId], messages: [{ id, postedAt: postedAt(sent.date) }], state }];
};
