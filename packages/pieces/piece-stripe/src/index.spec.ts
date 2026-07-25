import * as module from '@activepieces/piece-stripe';
import { pieceContract } from 'frogbot/pieces/test';
import { credentialExecution } from '../../credential-execution.js';
import { stripe, stripeActions } from './index.js';
pieceContract({ piece: stripe, service: 'stripe', credentialType: 'secret_text', actions: stripeActions });
credentialExecution({ module, piece: stripe, service: 'stripe', credential: 'stripe_test_key' });
