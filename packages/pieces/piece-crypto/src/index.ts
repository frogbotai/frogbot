import * as module from '@activepieces/piece-crypto';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const cryptoActions = ['hash-text', 'hmac-signature', 'generate-password', 'base64-decode', 'base64-encode', 'openpgpEncrypt'] as const;
export const crypto = createActivepiecesPiece({ module, service: 'crypto', credentialType: 'none', defaultActions: cryptoActions });
