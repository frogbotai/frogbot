import * as module from '@activepieces/piece-pagerduty';
import { pieceContract } from 'frogbot/pieces/test';

import { credentialExecution } from '../../../packages/pieces/credential-execution.js';
import {
  createPagerduty,
  pagerdutyActions,
} from '../../../packages/pieces/piece-pagerduty/src/index.js';

const pagerduty = createPagerduty();
pieceContract({
  piece: pagerduty,
  service: 'pagerduty',
  credentialType: 'secret_text',
  actions: pagerdutyActions,
});
credentialExecution({
  module,
  piece: pagerduty,
  service: 'pagerduty',
  credential: { type: 'SECRET_TEXT', secret_text: 'pagerduty_test_key' },
});
