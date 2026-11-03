import { createPieceHelpers } from 'frogbot/pieces';

import type { MicrosoftOutlookClient } from './client.js';

export const { defineAction, defineCustomApiCall, definePollingTrigger } =
  createPieceHelpers<MicrosoftOutlookClient>();
