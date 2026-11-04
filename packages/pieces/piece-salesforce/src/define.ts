import { createPieceHelpers } from 'frogbot/pieces';

import type { SalesforceClient } from './client.js';

export const { defineAction, defineCustomApiCall } = createPieceHelpers<SalesforceClient>();
