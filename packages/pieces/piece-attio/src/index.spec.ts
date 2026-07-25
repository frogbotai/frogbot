import * as module from '@activepieces/piece-attio';
import { pieceContract } from 'frogbot/pieces/test';
import { credentialExecution } from '../../credential-execution.js';
import { attio, attioActions } from './index.js';
pieceContract({ piece: attio, service: 'attio', credentialType: 'secret_text', actions: attioActions });
credentialExecution({ module, piece: attio, service: 'attio', credential: 'attio_test_key' });
