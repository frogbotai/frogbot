import { createPieceHelpers } from 'frogbot/pieces';

import type { MicrosoftTeamsClient } from './client.js';
import type { MicrosoftTeamsOptions } from './config.js';

export const { defineAction, defineAppTrigger, defineCustomApiCall, definePollingTrigger } =
  createPieceHelpers<MicrosoftTeamsClient, MicrosoftTeamsOptions>();
