import { createPieceHelpers } from 'frogbot/pieces';

import type { BraveSearch } from './client.js';

export const { defineAction, defineCustomApiCall } = createPieceHelpers<BraveSearch>();
