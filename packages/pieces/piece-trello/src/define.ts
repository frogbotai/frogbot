import { createPieceHelpers } from 'frogbot/pieces';

import type { Trello } from './client.js';

export const { defineAction, definePollingTrigger, defineWebhookTrigger } =
  createPieceHelpers<Trello>();
