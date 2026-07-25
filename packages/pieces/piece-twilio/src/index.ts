import * as module from '@activepieces/piece-twilio';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const twilioActions = ['send_sms', 'phone_number_lookup', 'make_call', 'get_message'] as const;
export const twilio = createActivepiecesPiece({ module, service: 'twilio', credentialType: 'basic_auth', defaultActions: twilioActions });
