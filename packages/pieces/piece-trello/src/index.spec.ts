import * as module from '@activepieces/piece-trello';
import { pieceContract } from 'frogbot/pieces/test';
import { credentialExecution } from '../../credential-execution.js';
import { trello, trelloActions } from './index.js';
pieceContract({ piece: trello, service: 'trello', credentialType: 'basic_auth', actions: trelloActions });
credentialExecution({ module, piece: trello, service: 'trello', credential: { username: 'trello_key', password: 'trello_token' } });
