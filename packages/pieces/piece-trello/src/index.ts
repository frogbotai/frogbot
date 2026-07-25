import * as module from '@activepieces/piece-trello';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const trelloActions = ['create_card', 'get_card', 'update_card', 'delete_card', 'get_card_attachments', 'add_card_attachment'] as const;
export const trello = createActivepiecesPiece({ module, service: 'trello', credentialType: 'basic_auth', defaultActions: trelloActions });
