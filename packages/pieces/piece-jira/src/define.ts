import { createPieceHelpers } from 'frogbot/pieces';

import type { JiraClient } from './client.js';
import type { JiraOptions } from './config.js';

export const { defineAction, defineCustomApiCall, definePollingTrigger } = createPieceHelpers<
  JiraClient,
  JiraOptions
>();
