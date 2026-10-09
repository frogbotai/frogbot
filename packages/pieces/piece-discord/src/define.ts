import { createPieceHelpers } from 'frogbot/pieces';

import type { DiscordClient } from './client.js';
import type { DiscordOptions } from './config.js';

export const { defineAction, defineAppTrigger, defineCustomApiCall } = createPieceHelpers<
  DiscordClient,
  DiscordOptions
>();
