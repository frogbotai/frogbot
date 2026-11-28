import { randomBytes } from 'node:crypto';

import type { Problem } from '@frogbotai/protocol';
import type { Config as PayloadConfig } from 'payload';

import { frogbotError } from './catalog.js';
import { isFrogBotError } from './FrogBotError.js';
import { toProblem } from './toProblem.js';

type PayloadAfterErrorHook = NonNullable<NonNullable<PayloadConfig['hooks']>['afterError']>[number];

type AppErrorResult = { response?: unknown; status?: number };

const appErrorResults = new WeakMap<object, AppErrorResult>();

/** Remembers what a collection's own `afterError` hook returned, so the root hook keeps it. */
export function recordAppErrorResult(req: object, result: unknown): void {
  if (!result || typeof result !== 'object') return;

  const { response, status } = result as AppErrorResult;
  const previous = appErrorResults.get(req) ?? {};

  appErrorResults.set(req, {
    ...previous,
    ...(response ? { response } : {}),
    ...(typeof status === 'number' ? { status } : {}),
  });
}

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

const ROUTE_NOT_FOUND = /^Route not found "(.*)"$/;

/**
 * Payload's own 404 for a path no endpoint matches, which it answers without running `afterError`,
 * rewritten as a `route.not-found` Problem. Every other response passes through unchanged.
 */
export async function withUnknownRouteProblem(
  response: Response,
  request: Request,
): Promise<Response> {
  if (response.status !== 404 || response.headers.get('content-type')?.includes('problem')) {
    return response;
  }

  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { message?: unknown } | null;

  const path = typeof body?.message === 'string' ? ROUTE_NOT_FOUND.exec(body.message)?.[1] : null;

  if (!path) return response;

  const problem = problemResponse(
    frogbotError('route.not-found', `No ${request.method} route at ${path}.`),
    { req: request },
  );

  response.headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith('access-control-')) problem.headers.set(key, value);
  });

  return problem;
}

/**
 * Core's root `afterError` hook, run before the app's: rewrites every routed REST error, FrogBot's
 * and Payload's, to a `Problem` with its headers, and logs `FrogBotError`s and hidden errors with
 * the request ID the caller sees. A collection hook's own response is kept as it is, with only the
 * request ID added, and its status replaces the Problem's. GraphQL errors are left to Payload.
 */
export const problemAfterError: PayloadAfterErrorHook = ({ error, graphqlResult, req }) => {
  if (graphqlResult) return;

  const requestId = requestIdFor(req);
  const app = appErrorResults.get(req);

  req.responseHeaders ??= new Headers();

  if (app?.response) {
    req.responseHeaders.set('X-Request-Id', requestId);

    return;
  }

  const converted = toProblem(error, {
    requestId,
    signedIn: Boolean(req.user),
    debug: req.payload?.config.debug === true,
  });

  const problem = app?.status ? { ...converted, status: app.status } : converted;

  problemHeaders(problem, error).forEach((value, key) => req.responseHeaders!.set(key, value));

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
