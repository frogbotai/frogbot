import { createPieceHelpers } from 'frogbot/pieces';

import type { ZoomClient } from './client.js';

export const { defineAction } = createPieceHelpers<ZoomClient>();
