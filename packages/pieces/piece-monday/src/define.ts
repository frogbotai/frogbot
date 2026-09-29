import { createPieceHelpers } from 'frogbot/pieces';

import type { Monday } from './client.js';

export const { defineAction, defineWebhookTrigger } = createPieceHelpers<Monday>();
