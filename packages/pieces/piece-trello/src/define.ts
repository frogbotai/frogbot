import { createPieceHelpers } from 'frogbot/pieces';

import type { Trello } from './client.js';

export const { defineAction, defineCustomApiCall, definePollingTrigger, defineWebhookTrigger } =
  createPieceHelpers<Trello>();
