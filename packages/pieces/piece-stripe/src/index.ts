import * as module from '@activepieces/piece-stripe';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const stripeActions = ['create_customer', 'search_customer', 'retrieve_customer', 'update_customer', 'create_invoice', 'retrieve_invoice', 'create_payment_link', 'create_refund'] as const;
export const stripe = createActivepiecesPiece({ module, service: 'stripe', credentialType: 'secret_text', defaultActions: stripeActions });
