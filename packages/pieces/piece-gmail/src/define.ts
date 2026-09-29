import { createPieceHelpers } from 'frogbot/pieces';

import type { Gmail } from './client.js';

export const { defineAction, definePollingTrigger } = createPieceHelpers<Gmail>();
