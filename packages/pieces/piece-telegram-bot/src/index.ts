import { definePiece } from 'frogbot/pieces';

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
import { createTelegramBotClient } from './client.js';
import { telegramBotAuth } from './config.js';
import { newUpdate } from './triggers/newUpdate.js';

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

export const createTelegramBot = definePiece({
  slug: 'telegramBot',
  label: 'Telegram Bot',
  admin: { description: 'Build chatbots and respond to Telegram updates', group: 'Communication' },
  auth: telegramBotAuth,
  client: createTelegramBotClient,
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
