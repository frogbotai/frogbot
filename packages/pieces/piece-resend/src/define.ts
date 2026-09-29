import { createPieceHelpers } from 'frogbot/pieces';

import type { ResendClient } from './client.js';
import type { ResendOptions } from './config.js';

export const { defineAction } = createPieceHelpers<ResendClient, ResendOptions>();
