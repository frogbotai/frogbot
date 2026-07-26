import * as module from '@activepieces/piece-monday';
import { pieceContract } from 'frogbot/pieces/test';
import { credentialExecution } from '../../credential-execution.js';
import { createMonday, mondayActions } from './index.js';

const monday = createMonday();
pieceContract({ piece: monday, service: 'monday', credentialType: 'secret_text', actions: mondayActions });
credentialExecution({ module, piece: monday, service: 'monday', credential: 'monday_test_key' });
