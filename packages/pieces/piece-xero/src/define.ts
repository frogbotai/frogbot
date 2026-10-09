import { createPieceHelpers } from 'frogbot/pieces';

import type { XeroClient } from './client.js';
import type { XeroOptions } from './config.js';

export const { defineAction, defineAppTrigger, defineCustomApiCall, definePollingTrigger } =
  createPieceHelpers<XeroClient, XeroOptions>();
