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
