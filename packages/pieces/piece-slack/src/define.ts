import { createPieceHelpers } from 'frogbot/pieces';

import type { SlackClient } from './client.js';
import type { SlackOptions } from './config.js';

export const { defineAction, defineAppTrigger, defineCustomApiCall } = createPieceHelpers<
  SlackClient,
  SlackOptions
>();
