import { createTelegramAdapter } from '@chat-adapter/telegram';
import { definePiece, type PieceChannel, type PieceWebhook } from 'frogbot/pieces';
import type { z } from 'zod';

import {
  answerCallbackQuery,
  createInviteLink,
  customApiCall,
  deleteMessage,
  editMessageText,
  forwardMessage,
  getChat,
  getChatMember,
  getFile,
  pinMessage,
  sendAudio,
  sendChatAction,
  sendDocument,
  sendLocation,
  sendMedia,
  sendMediaGroup,
  sendPoll,
  sendTextMessage,
  unpinMessage,
} from './actions/index.js';
import { createTelegramBotClient, type TelegramBotClient } from './client.js';
import { telegramBotAuth, telegramBotOptions } from './config.js';
import { newUpdate } from './triggers/newUpdate.js';
import { parseTelegramWebhook, verifyTelegramWebhook } from './webhook.js';

export const telegramBotActions = [
  'sendTextMessage',
  'sendMedia',
  'sendDocument',
  'sendAudio',
  'sendLocation',
  'sendMediaGroup',
  'sendPoll',
  'sendChatAction',
  'editMessageText',
  'deleteMessage',
  'forwardMessage',
  'pinMessage',
  'unpinMessage',
  'getChat',
  'getChatMember',
  'getFile',
  'createInviteLink',
  'answerCallbackQuery',
  'customApiCall',
] as const;
export const telegramBotTriggers = ['newUpdate'] as const;
export const telegramBotScopes = [] as const;

const telegramBotWebhook = {
  verify: verifyTelegramWebhook,
  parse() {
    return parseTelegramWebhook();
  },
} satisfies PieceWebhook<z.output<typeof telegramBotOptions>>;

const telegramBotChannel = {
  adapter({ auth, options }) {
    if (!options.webhookSecret) {
      throw new Error('Telegram channels require a webhookSecret option.');
    }

    return createTelegramAdapter({
      botToken: auth.botToken,
      secretToken: options.webhookSecret,
      userName: options.botUsername,
      allowedUserIds: options.allowedUserIds,
      mode: 'webhook',
    });
  },
  async identity() {
    return null;
  },
} satisfies PieceChannel<
  z.output<typeof telegramBotAuth>,
  z.output<typeof telegramBotOptions>,
  TelegramBotClient
>;

export const createTelegramBot = definePiece({
  slug: 'telegramBot',
  label: 'Telegram Bot',
  admin: { description: 'Build chatbots and respond to Telegram updates', group: 'Communication' },
  auth: telegramBotAuth,
  options: telegramBotOptions,
  client: createTelegramBotClient,
  webhook: telegramBotWebhook,
  channel: telegramBotChannel,
  actions: [
    sendTextMessage,
    sendMedia,
    sendDocument,
    sendAudio,
    sendLocation,
    sendMediaGroup,
    sendPoll,
    sendChatAction,
    editMessageText,
    deleteMessage,
    forwardMessage,
    pinMessage,
    unpinMessage,
    getChat,
    getChatMember,
    getFile,
    createInviteLink,
    answerCallbackQuery,
    customApiCall,
  ],
  triggers: [newUpdate],
});
