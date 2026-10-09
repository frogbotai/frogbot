import { createPieceHelpers } from 'frogbot/pieces';

import type { DropboxClient } from './client.js';

export const { defineAction, defineCustomApiCall, definePollingTrigger } =
  createPieceHelpers<DropboxClient>();
