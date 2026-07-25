import * as module from '@activepieces/piece-date-helper';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const dateHelperActions = ['get_current_date', 'format_date', 'add_subtract_date', 'date_difference', 'extract_date_parts', 'next_day_of_week', 'next_day_of_year', 'first_day_of_previous_month', 'last_day_of_previous_month'] as const;
export const dateHelper = createActivepiecesPiece({ module, service: 'date_helper', credentialType: 'none', defaultActions: dateHelperActions });
