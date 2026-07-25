import * as module from '@activepieces/piece-pagerduty';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const pagerdutyActions = ['create_incident', 'list_incidents', 'get_incident', 'acknowledge_incident', 'resolve_incident'] as const;
export const pagerduty = createActivepiecesPiece({ module, service: 'pagerduty', credentialType: 'secret_text', defaultActions: pagerdutyActions });
