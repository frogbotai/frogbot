import * as module from '@activepieces/piece-posthog';
import { pieceContract } from 'frogbot/pieces/test';

import { credentialExecution } from '../../credential-execution.js';
import { createPosthog, posthogActions } from './index.js';

const posthog = createPosthog();
pieceContract({ piece: posthog, service: 'posthog', credentialType: 'secret_text', actions: posthogActions });
credentialExecution({ module, piece: posthog, service: 'posthog', credential: { type: 'SECRET_TEXT', secret_text: 'posthog_test_key' } });
