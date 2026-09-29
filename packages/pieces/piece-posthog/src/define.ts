import { createPieceHelpers } from 'frogbot/pieces';

import type { PosthogClient } from './client.js';

export const { defineAction } = createPieceHelpers<PosthogClient>();
