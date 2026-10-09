import { createPieceHelpers } from 'frogbot/pieces';

import type { AttioClient } from './client.js';

export const { defineAction, defineCustomApiCall, defineWebhookTrigger } =
  createPieceHelpers<AttioClient>();
