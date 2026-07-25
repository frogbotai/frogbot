import * as module from '@activepieces/piece-resend';
import { pieceContract } from 'frogbot/pieces/test';
import { credentialExecution } from '../../credential-execution.js';
import { resend, resendActions } from './index.js';
pieceContract({ piece: resend, service: 'resend', credentialType: 'secret_text', actions: resendActions });
credentialExecution({ module, piece: resend, service: 'resend', credential: 're_test_key' });
