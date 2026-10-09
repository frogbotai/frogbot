import { createPieceHelpers } from 'frogbot/pieces';

import type { AirtableClient } from './client.js';

export const { defineAction, defineCustomApiCall, definePollingTrigger } =
  createPieceHelpers<AirtableClient>();
