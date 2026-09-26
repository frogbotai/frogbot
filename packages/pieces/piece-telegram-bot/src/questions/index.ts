import type { PieceChannelQuestions } from 'frogbot/pieces';

import type { TelegramBotClient } from '../client.js';
import { denyTelegramQuestion, rejectTelegramQuestion, staleTelegramQuestion } from './notify.js';
import { parseTelegramQuestion } from './parse.js';
import { renderTelegramQuestion } from './render.js';
import { settleTelegramQuestion } from './settled.js';
import { supportsTelegramQuestion } from './supports.js';
import { updateTelegramQuestion } from './updated.js';

export const telegramQuestions: PieceChannelQuestions<TelegramBotClient> = {
  supports: supportsTelegramQuestion,
  render: renderTelegramQuestion,
  parse: parseTelegramQuestion,
  settled: settleTelegramQuestion,
  updated: updateTelegramQuestion,
  rejected: rejectTelegramQuestion,
  denied: denyTelegramQuestion,
  stale: staleTelegramQuestion,
};
