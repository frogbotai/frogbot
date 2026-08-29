import * as module from '@activepieces/piece-google-drive';
import { pieceContract } from 'frogbot/pieces/test';

import { credentialExecution } from '../../../packages/pieces/credential-execution.js';
import {
  createGoogleDrive,
  googleDriveActions,
} from '../../../packages/pieces/piece-google-drive/src/index.js';

const googleDrive = createGoogleDrive();
pieceContract({
  piece: googleDrive,
  service: 'google-drive',
  credentialType: 'oauth2',
  actions: googleDriveActions,
});
credentialExecution({
  module,
  piece: googleDrive,
  service: 'google-drive',
  credential: { access_token: 'google-test' },
});
