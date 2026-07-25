import * as module from '@activepieces/piece-telegram-bot';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const telegramBotActions = ['send_text_message', 'send_media', 'send_document', 'send_location', 'edit_message_text', 'get_chat'] as const;
export const telegramBot = createActivepiecesPiece({ module, service: 'telegram_bot', credentialType: 'secret_text', defaultActions: telegramBotActions });
