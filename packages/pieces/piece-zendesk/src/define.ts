import { createPieceHelpers } from 'frogbot/pieces';

import type { ZendeskClient } from './client.js';

export const { defineAction, defineCustomApiCall, definePollingTrigger, defineWebhookTrigger } =
  createPieceHelpers<ZendeskClient>();
