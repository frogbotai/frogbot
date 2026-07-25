import * as module from '@activepieces/piece-monday';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const mondayActions = ['monday_create_item', 'monday_create_update', 'monday_get_board_values', 'monday_get_item_column_values', 'monday_update_column_values_of_item'] as const;
export const monday = createActivepiecesPiece({ module, service: 'monday', credentialType: 'secret_text', defaultActions: mondayActions });
