import * as module from '@activepieces/piece-notion';
import { pieceContract } from 'frogbot/pieces/test';

import { credentialExecution } from '../../../packages/pieces/credential-execution.js';
import { createNotion, notionActions } from '../../../packages/pieces/piece-notion/src/index.js';

const notion = createNotion();
pieceContract({
  piece: notion,
  service: 'notion',
  credentialType: 'oauth2',
  actions: notionActions,
});
credentialExecution({
  module,
  piece: notion,
  service: 'notion',
  credential: { access_token: 'notion-test' },
});
