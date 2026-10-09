import { createPieceHelpers } from 'frogbot/pieces';

import type { GithubClient } from './client.js';
import type { GithubOptions } from './config.js';

export const { defineAction, defineCustomApiCall, defineWebhookTrigger } = createPieceHelpers<
  GithubClient,
  GithubOptions
>();
