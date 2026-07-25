import * as module from '@activepieces/piece-qrcode';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const qrcodeActions = ['text_to_qrcode'] as const;
export const qrcode = createActivepiecesPiece({ module, service: 'qrcode', credentialType: 'none', defaultActions: qrcodeActions });
