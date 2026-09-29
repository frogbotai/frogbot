import { createPieceHelpers } from 'frogbot/pieces';

import type { PagerdutyClient } from './client.js';
import type { PagerdutyOptions } from './config.js';

export const { defineAction, defineWebhookTrigger } = createPieceHelpers<
  PagerdutyClient,
  PagerdutyOptions
>();
