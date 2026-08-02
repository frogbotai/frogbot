import * as module from '@activepieces/piece-attio';
import { pieceContract } from 'frogbot/pieces/test';

import { credentialExecution } from '../../credential-execution.js';
import { attioActions,createAttio } from './index.js';

const attio = createAttio();
pieceContract({ piece: attio, service: 'attio', credentialType: 'secret_text', actions: attioActions });
credentialExecution({ module, piece: attio, service: 'attio', credential: { type: 'SECRET_TEXT', secret_text: 'attio_test_key' } });
