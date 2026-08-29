import * as module from '@activepieces/piece-telegram-bot';
import { pieceContract } from 'frogbot/pieces/test';

import { credentialExecution } from '../../../packages/pieces/credential-execution.js';
import { createTelegramBot, telegramBotActions } from '../../../packages/pieces/piece-telegram-bot/src/index.js';

const telegramBot = createTelegramBot();
pieceContract({
  piece: telegramBot,
  service: 'telegram_bot',
  credentialType: 'secret_text',
  actions: telegramBotActions,
});
credentialExecution({
  module,
  piece: telegramBot,
  service: 'telegram_bot',
  credential: { type: 'SECRET_TEXT', secret_text: 'telegram_test_key' },
});
