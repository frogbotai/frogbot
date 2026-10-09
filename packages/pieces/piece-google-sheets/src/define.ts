import { createPieceHelpers } from 'frogbot/pieces';

import type { GoogleSheetsClient } from './client.js';

export const { defineAction, defineCustomApiCall } = createPieceHelpers<GoogleSheetsClient>();
