import { createPieceHelpers } from 'frogbot/pieces';

import type { Linear } from './client.js';
import type { LinearOptions } from './config.js';

export const { defineAction, defineWebhookTrigger } = createPieceHelpers<Linear, LinearOptions>();
