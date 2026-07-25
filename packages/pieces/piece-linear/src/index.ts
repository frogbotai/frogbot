import * as module from '@activepieces/piece-linear';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const linearActions = ['linear_create_issue', 'linear_update_issue', 'linear_create_project', 'linear_create_comment'] as const;
export const linear = createActivepiecesPiece({ module, service: 'linear', credentialType: 'secret_text', defaultActions: linearActions });
