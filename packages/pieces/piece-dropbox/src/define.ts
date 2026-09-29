import { createPieceHelpers } from 'frogbot/pieces';

import type { DropboxClient } from './client.js';

export const { defineAction, definePollingTrigger } = createPieceHelpers<DropboxClient>();
