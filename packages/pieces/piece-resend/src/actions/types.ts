import type { PieceDefinition } from 'frogbot/pieces';

import type { ResendClient } from '../client.js';
import type { ResendTypes } from '../piece-types.js';

export type ResendAction = PieceDefinition<ResendTypes, ResendClient>['actions'][number];
