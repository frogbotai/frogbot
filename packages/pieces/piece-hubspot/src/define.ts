import { createPieceHelpers } from 'frogbot/pieces';

import type { HubSpotClient } from './client.js';

export const { defineAction, defineCustomApiCall, definePollingTrigger } =
  createPieceHelpers<HubSpotClient>();
