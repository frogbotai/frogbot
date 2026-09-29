import { createPieceHelpers } from 'frogbot/pieces';

import type { NotionClient } from './client.js';

export const { defineAction, definePollingTrigger } = createPieceHelpers<NotionClient>();
