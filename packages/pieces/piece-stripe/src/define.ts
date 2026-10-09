import { createPieceHelpers } from 'frogbot/pieces';

import type { StripeClient } from './client.js';

export const { defineAction, defineWebhookTrigger, defineCustomApiCall } =
  createPieceHelpers<StripeClient>();
