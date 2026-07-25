import * as module from '@activepieces/piece-http';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const httpActions = ['send_request', 'parse_url'] as const;
export const http = createActivepiecesPiece({ module, service: 'http', credentialType: 'none', defaultActions: httpActions, errorsAsResults: true });
