import { createPieceHelpers } from 'frogbot/pieces';

import type { TwilioClient } from './client.js';
import type { TwilioOptions } from './config.js';

export const { defineAction, definePollingTrigger } = createPieceHelpers<
  TwilioClient,
  TwilioOptions
>();
