import * as module from '@activepieces/piece-airtable';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const airtableActions = ['airtable_create_record', 'airtable_find_record', 'airtable_update_record', 'airtable_delete_record', 'airtable_add_comment_to_record', 'airtable_get_record_by_id'] as const;
export const airtable = createActivepiecesPiece({ module, service: 'airtable', credentialType: 'secret_text', defaultActions: airtableActions });
