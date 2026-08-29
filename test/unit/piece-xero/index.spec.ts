import * as module from '@activepieces/piece-xero';
import { pieceContract } from 'frogbot/pieces/test';

import { credentialExecution } from '../../../packages/pieces/credential-execution.js';
import { createXero, xeroActions } from '../../../packages/pieces/piece-xero/src/index.js';

const xero = createXero();
pieceContract({
  piece: xero,
  service: 'xero',
  credentialType: 'oauth2',
  actions: xeroActions,
});
credentialExecution({
  module,
  piece: xero,
  service: 'xero',
  credential: { access_token: 'xero-test' },
});
