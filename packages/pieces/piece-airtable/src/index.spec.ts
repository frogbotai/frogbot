import * as module from '@activepieces/piece-airtable';
import { pieceContract } from 'frogbot/pieces/test';

import { credentialExecution } from '../../credential-execution.js';
import { airtableActions,createAirtable } from './index.js';

const airtable = createAirtable();
pieceContract({ piece: airtable, service: 'airtable', credentialType: 'secret_text', actions: airtableActions });
credentialExecution({ module, piece: airtable, service: 'airtable', credential: { type: 'SECRET_TEXT', secret_text: 'airtable_test_key' } });
