import * as module from '@activepieces/piece-linear';
import { pieceContract } from 'frogbot/pieces/test';
import { credentialExecution } from '../../credential-execution.js';
import { createLinear, linearActions } from './index.js';

const linear = createLinear();
pieceContract({ piece: linear, service: 'linear', credentialType: 'secret_text', actions: linearActions });
credentialExecution({ module, piece: linear, service: 'linear', credential: 'lin_api_test' });
