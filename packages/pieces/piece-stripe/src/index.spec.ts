import * as module from '@activepieces/piece-stripe';
import { pieceContract } from 'frogbot/pieces/test';
import { credentialExecution } from '../../credential-execution.js';
import { createStripe, stripeActions } from './index.js';

const stripe = createStripe();
pieceContract({ piece: stripe, service: 'stripe', credentialType: 'secret_text', actions: stripeActions });
credentialExecution({ module, piece: stripe, service: 'stripe', credential: 'stripe_test_key' });
