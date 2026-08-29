import * as module from '@activepieces/piece-linear';
import { pieceContract } from 'frogbot/pieces/test';

import { credentialExecution } from '../../../packages/pieces/credential-execution.js';
import { createLinear, linearActions } from '../../../packages/pieces/piece-linear/src/index.js';

const linear = createLinear();
pieceContract({
  piece: linear,
  service: 'linear',
  credentialType: 'secret_text',
  actions: linearActions,
});
credentialExecution({
  module,
  piece: linear,
  service: 'linear',
  credential: { type: 'SECRET_TEXT', secret_text: 'lin_api_test' },
});
