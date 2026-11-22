import type { RunInlineTaskFunction as PayloadRunInlineTaskFunction } from 'payload';

import type { FrogBot } from '../frogbot.js';
import type { RunInlineTaskFunction } from '../jobs/waitpoints/types.js';
import type { FrogBotLocalAPI } from '../localAPI.js';
import type { TypedUser } from '../types/generated.js';
import type { Payload, PayloadRequest } from '../types/payload.js';
import type { FrogBotRequest, MigrationRequest } from '../types/request.js';
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

/** A migration's request is Payload's migration request, typed without `payload`. */
export function migrationPayloadRequest(req: MigrationRequest): PayloadRequest {
  return req as unknown as PayloadRequest;
}

/** Attaches `frogbot` to a Payload request and returns it typed as a FrogBot request. */
export function toFrogBotRequest(req: PayloadRequest, frogbot: FrogBot): FrogBotRequest {
  return Object.assign(req, { frogbot });
}

/** For code that runs inside `wrapJobs`, which has already attached `frogbot` to the request. */
export function asAttachedRequest(req: PayloadRequest): FrogBotRequest {
  return req as unknown as FrogBotRequest;
}

/** For `inlineTask` inside `wrapJobs`, which passes each step the workflow's attached request. */
export function asAttachedInlineTask(
  inlineTask: PayloadRunInlineTaskFunction,
): RunInlineTaskFunction {
  return inlineTask as unknown as RunInlineTaskFunction;
}

export function hasFrogBot(req: PayloadRequest): req is PayloadRequest & { frogbot: FrogBot } {
  return 'frogbot' in req && Boolean(req.frogbot);
}

export function toFrogBotLocalAPI(payload: Payload): FrogBotLocalAPI {
  return payload as unknown as FrogBotLocalAPI;
}
