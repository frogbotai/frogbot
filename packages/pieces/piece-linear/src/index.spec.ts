import * as module from '@activepieces/piece-linear';
import { pieceContract } from 'frogbot/pieces/test';
import { credentialExecution } from '../../credential-execution.js';
import { linear, linearActions } from './index.js';
pieceContract({ piece: linear, service: 'linear', credentialType: 'secret_text', actions: linearActions });
credentialExecution({ module, piece: linear, service: 'linear', credential: 'lin_api_test' });
