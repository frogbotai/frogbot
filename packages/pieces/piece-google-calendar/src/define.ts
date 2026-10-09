import { createPieceHelpers } from 'frogbot/pieces';

import type { GoogleCalendar } from './client.js';

export const { defineAction, defineCustomApiCall } = createPieceHelpers<GoogleCalendar>();
