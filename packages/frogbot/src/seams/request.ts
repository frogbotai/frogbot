// The FrogBot ↔ Payload request seam. A `FrogBotRequest` is Payload's
// request object with `frogbot` attached: `payload` is hidden from the type,
// not removed, so handing it back to Payload is a type change only. The
// local API is the same: FrogBot's methods are Payload's, called with those
// requests.

import type { FrogBot } from '../frogbot.js';
import type { FrogBotLocalAPI } from '../localAPI.js';
import type { TypedUser } from '../types/generated.js';
import type { Payload, PayloadRequest } from '../types/payload.js';
import type { FrogBotRequest } from '../types/request.js';
import type { Check, Extends, Mutual } from './check.js';

export type _RequestChecks = [
  Check<Mutual<Omit<FrogBotRequest, 'frogbot' | 'user'>, Omit<PayloadRequest, 'payload' | 'user'>>>,
  Check<Extends<NonNullable<PayloadRequest['user']>, TypedUser>>,
  Check<Extends<PayloadRequest & { frogbot: FrogBot }, FrogBotRequest>>,
  Check<Extends<keyof FrogBotLocalAPI, keyof Payload>>,
];

export function toPayloadRequest(req: FrogBotRequest): PayloadRequest {
  return req as unknown as PayloadRequest;
}

export function hasFrogBot(req: PayloadRequest): req is PayloadRequest & { frogbot: FrogBot } {
  return 'frogbot' in req && Boolean(req.frogbot);
}

export function toFrogBotLocalAPI(payload: Payload): FrogBotLocalAPI {
  return payload as unknown as FrogBotLocalAPI;
}
