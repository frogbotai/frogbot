import * as module from '@activepieces/piece-attio';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const attioActions = ['create_record', 'update_record', 'find_record', 'get_record', 'create_note', 'create_task'] as const;
export const attio = createActivepiecesPiece({ module, service: 'attio', credentialType: 'secret_text', defaultActions: attioActions });
