import * as module from '@activepieces/piece-graphql';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const graphqlActions = ['send_request'] as const;
export const graphql = createActivepiecesPiece({ module, service: 'graphql', credentialType: 'none', defaultActions: graphqlActions, errorsAsResults: true });
