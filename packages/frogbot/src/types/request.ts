// FrogBot's request shape. Extends Payload's `PayloadRequest` but swaps
// the `payload` field for `frogbot: Frogbot`. User code authored against
// `FrogbotRequest` cannot reference `req.payload` (type error), keeping
// the FrogBot brand consistent in every hook, access function, and
// custom endpoint.

import type { PayloadRequest } from './payload.js';

import type { Frogbot } from '../frogbot.js';

export interface FrogbotRequest<TUser = unknown>
  extends Omit<PayloadRequest, 'payload' | 'user'> {
  user: TUser | null;
  frogbot: Frogbot;
}
