import * as module from '@activepieces/piece-pagerduty';
import { pieceContract } from 'frogbot/pieces/test';
import { credentialExecution } from '../../credential-execution.js';
import { pagerduty, pagerdutyActions } from './index.js';
pieceContract({ piece: pagerduty, service: 'pagerduty', credentialType: 'secret_text', actions: pagerdutyActions });
credentialExecution({ module, piece: pagerduty, service: 'pagerduty', credential: 'pagerduty_test_key' });
