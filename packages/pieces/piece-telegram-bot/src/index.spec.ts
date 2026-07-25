import * as module from '@activepieces/piece-telegram-bot';
import { pieceContract } from 'frogbot/pieces/test';
import { credentialExecution } from '../../credential-execution.js';
import { telegramBot, telegramBotActions } from './index.js';
pieceContract({ piece: telegramBot, service: 'telegram_bot', credentialType: 'secret_text', actions: telegramBotActions });
credentialExecution({ module, piece: telegramBot, service: 'telegram_bot', credential: 'telegram_test_key' });
