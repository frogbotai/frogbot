import * as module from '@activepieces/piece-google-calendar';
import { pieceContract } from 'frogbot/pieces/test';

import { credentialExecution } from '../../../packages/pieces/credential-execution.js';
import { createGoogleCalendar, googleCalendarActions } from '../../../packages/pieces/piece-google-calendar/src/index.js';

const googleCalendar = createGoogleCalendar();
pieceContract({
  piece: googleCalendar,
  service: 'google-calendar',
  credentialType: 'oauth2',
  actions: googleCalendarActions,
});
credentialExecution({
  module,
  piece: googleCalendar,
  service: 'google-calendar',
  credential: { access_token: 'google-test' },
});
