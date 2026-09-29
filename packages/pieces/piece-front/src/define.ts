import { createPieceHelpers } from 'frogbot/pieces';

import type { FrontClient } from './client.js';
import type { FrontOptions } from './config.js';

export const { defineAction, definePollingTrigger } = createPieceHelpers<
  FrontClient,
  FrontOptions
>();
