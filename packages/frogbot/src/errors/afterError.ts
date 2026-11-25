import { randomBytes } from 'node:crypto';

import type { Problem } from '@frogbotai/protocol';
import type { Config as PayloadConfig } from 'payload';

import { isFrogBotError } from './FrogBotError.js';
import { toProblem } from './toProblem.js';

type PayloadAfterErrorHook = NonNullable<NonNullable<PayloadConfig['hooks']>['afterError']>[number];

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/** The incoming `X-Request-Id`, or a new `req_<16 hex>` id. */
export function requestIdFor(req: { headers?: Headers } | undefined): string {
  const incoming = req?.headers?.get('x-request-id')?.trim();

  return incoming && incoming.length <= 128 ? incoming : `req_${randomBytes(8).toString('hex')}`;
}

/** The headers a `Problem` response carries: its type, request id, retry delay and the error's own. */
export function problemHeaders(problem: Problem, error: unknown): Headers {
  const headers = new Headers(isFrogBotError(error) ? error.headers : undefined);

  headers.set('Content-Type', PROBLEM_CONTENT_TYPE);
  if (problem.requestId) headers.set('X-Request-Id', problem.requestId);
  if (problem.retryAfter !== undefined) headers.set('Retry-After', String(problem.retryAfter));

  return headers;
}

/** A `Response` for any thrown value, for code that answers outside Payload's error route. */
export function problemResponse(
  error: unknown,
  { req, debug }: { req?: { headers?: Headers; user?: unknown }; debug?: boolean } = {},
): Response {
  const problem = toProblem(error, {
    requestId: requestIdFor(req),
    signedIn: Boolean(req?.user),
    debug,
  });

  return Response.json(problem, {
    status: problem.status,
    headers: problemHeaders(problem, error),
  });
}

/**
 * Core's root `afterError` hook, run before the app's: rewrites every routed error, FrogBot's and
 * Payload's, to a `Problem` with its headers, and logs `FrogBotError`s and hidden errors with the
 * request ID the caller sees.
 */
export const problemAfterError: PayloadAfterErrorHook = ({ error, req }) => {
  const problem = toProblem(error, {
    requestId: requestIdFor(req),
    signedIn: Boolean(req.user),
    debug: req.payload?.config.debug === true,
  });

  const headers = problemHeaders(problem, error);
  req.responseHeaders ??= new Headers();
  headers.forEach((value, key) => req.responseHeaders!.set(key, value));

  if (isFrogBotError(error)) {
    const level = problem.status >= 500 ? 'error' : 'info';

    req.payload?.logger[level](
      { err: error, code: problem.code, requestId: problem.requestId },
      `[frogbot] ${problem.code}: ${problem.detail}`,
    );
  } else if (problem.code === 'internal') {
    req.payload?.logger.error(
      { err: error, code: problem.code, requestId: problem.requestId },
      `[frogbot] internal error in request ${problem.requestId}`,
    );
  }

  return { response: problem, status: problem.status };
};
