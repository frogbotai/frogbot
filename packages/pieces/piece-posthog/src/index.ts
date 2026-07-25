import * as module from '@activepieces/piece-posthog';
import { createActivepiecesPiece } from 'frogbot/pieces';

export const posthogActions = ['create_event', 'create_project'] as const;
export const posthog = createActivepiecesPiece({ module, service: 'posthog', credentialType: 'secret_text', defaultActions: posthogActions });
