import * as module from '@activepieces/piece-csv';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const csvActions = ['convert_csv_to_json', 'convert_json_to_csv'] as const;
export const csv = createActivepiecesPiece({ module, service: 'csv', credentialType: 'none', defaultActions: csvActions });
