import { createPieceHelpers } from 'frogbot/pieces';

import type { GoogleDriveClient } from './client.js';

export const { defineAction } = createPieceHelpers<GoogleDriveClient>();
