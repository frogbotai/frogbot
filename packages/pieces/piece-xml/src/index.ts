import * as module from '@activepieces/piece-xml';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const xmlActions = ['convert-json-to-xml'] as const;
export const xml = createActivepiecesPiece({ module, service: 'xml', credentialType: 'none', defaultActions: xmlActions });
