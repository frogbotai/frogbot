import * as module from '@activepieces/piece-resend';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const resendActions = ['send_email'] as const;
export const resend = createActivepiecesPiece({ module, service: 'resend', credentialType: 'secret_text', defaultActions: resendActions });
