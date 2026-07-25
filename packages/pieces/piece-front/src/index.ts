import * as module from '@activepieces/piece-front';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const frontActions = ['addComment', 'assignUnassignConversation', 'createContact', 'findContact', 'findConversation', 'sendMessage', 'sendReply', 'updateConversation'] as const;
export const front = createActivepiecesPiece({ module, service: 'front', credentialType: 'secret_text', defaultActions: frontActions });
