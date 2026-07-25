import * as module from '@activepieces/piece-front';
import { pieceContract } from 'frogbot/pieces/test';
import { credentialExecution } from '../../credential-execution.js';
import { front, frontActions } from './index.js';
pieceContract({ piece: front, service: 'front', credentialType: 'secret_text', actions: frontActions });
credentialExecution({ module, piece: front, service: 'front', credential: 'front_test_key' });
