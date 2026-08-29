import * as module from '@activepieces/piece-front';
import { pieceContract } from 'frogbot/pieces/test';

import { credentialExecution } from '../../../packages/pieces/credential-execution.js';
import { createFront, frontActions } from '../../../packages/pieces/piece-front/src/index.js';

const front = createFront();
pieceContract({
  piece: front,
  service: 'front',
  credentialType: 'secret_text',
  actions: frontActions,
});
credentialExecution({
  module,
  piece: front,
  service: 'front',
  credential: { type: 'SECRET_TEXT', secret_text: 'front_test_key' },
});
