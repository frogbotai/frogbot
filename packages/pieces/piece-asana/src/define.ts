import { createPieceHelpers } from 'frogbot/pieces';

import type { AsanaClient } from './client.js';

export const { defineAction, defineCustomApiCall, defineWebhookTrigger } =
  createPieceHelpers<AsanaClient>();
