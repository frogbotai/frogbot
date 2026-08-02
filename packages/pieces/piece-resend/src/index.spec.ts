import * as module from '@activepieces/piece-resend';
import { pieceContract } from 'frogbot/pieces/test';

import { credentialExecution } from '../../credential-execution.js';
import { createResend, resendActions } from './index.js';

const resend = createResend();
pieceContract({ piece: resend, service: 'resend', credentialType: 'secret_text', actions: resendActions });
credentialExecution({ module, piece: resend, service: 'resend', credential: { type: 'SECRET_TEXT', secret_text: 're_test_key' } });
