import * as module from '@activepieces/piece-twilio';
import { pieceContract } from 'frogbot/pieces/test';
import { credentialExecution } from '../../credential-execution.js';
import { twilio, twilioActions } from './index.js';
pieceContract({ piece: twilio, service: 'twilio', credentialType: 'basic_auth', actions: twilioActions });
credentialExecution({ module, piece: twilio, service: 'twilio', credential: { username: 'AC_test', password: 'twilio_token' } });
