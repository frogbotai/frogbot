import { createPieceHelpers } from 'frogbot/pieces';

import type { TelegramBotClient } from './client.js';
import type { TelegramBotOptions } from './config.js';

export const { defineAction, defineAppTrigger } = createPieceHelpers<
  TelegramBotClient,
  TelegramBotOptions
>();
