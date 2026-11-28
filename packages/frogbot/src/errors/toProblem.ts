import type { Problem, ProblemEntry } from '@frogbotai/protocol';

import { frogbotError } from './catalog.js';
import { ERRORS_DOCS_URL, type FrogBotError, isFrogBotError } from './FrogBotError.js';
import { gatewayFrogBotError, isGatewayError } from './gateway.js';

type PayloadErrorLike = Error & {
  status?: number;
  isPublic?: boolean;
  data?: unknown;
};

/** What `toProblem` needs to know about the request that failed. */
export type ToProblemOptions = {
  requestId?: string;
  /** Whether the request had a user; a refused anonymous request then says to sign in. */
  signedIn?: boolean;
  /** Payload's `debug`: send unexpected errors' real messages instead of hiding them. */
  debug?: boolean;
};

const PAYLOAD_CODES = {
  AuthenticationError: 'auth.invalid-credentials',
  ErrorDeletingFile: 'upload.delete-failed',
  FileRetrievalError: 'upload.unreadable',
  FileUploadError: 'upload.failed',
  Forbidden: 'auth.forbidden',
  Locked: 'doc.locked',
  LockedAuth: 'auth.locked',
  MissingFile: 'upload.missing-file',
  NotFound: 'doc.not-found',
  QueryError: 'request.invalid-query',
  UnauthorizedError: 'auth.unauthenticated',
  UnverifiedEmail: 'auth.unverified-email',
  ValidationError: 'request.invalid',
} as const;

const PAYLOAD_INVALID_JSON = 'Invalid JSON';

const SIGN_IN_HINT = 'Sign in, or send an API key in the Authorization header, then retry.';

/**
 * Turns any thrown value into the `Problem` every surface sends. A `FrogBotError` keeps its code;
 * Payload's own errors get fixed codes; any other public error is `request.rejected`, and the rest
 * are `internal`, with the message hidden unless `debug` is on.
 */
export function toProblem(error: unknown, options: ToProblemOptions = {}): Problem {
  const known = toFrogBotError(error, options);

  return {
    type: `${ERRORS_DOCS_URL}#${known.code}`,
    code: known.code,
    title: known.title,
    status: known.status,
    detail: known.message,
    hint: known.hint,
    retryable: known.retryable,
    ...(known.retryAfter !== undefined ? { retryAfter: known.retryAfter } : {}),
    ...(options.requestId ? { requestId: options.requestId } : {}),
    ...(isFrogBotError(error) && known.data ? { data: known.data } : {}),
    errors: entries(error, known, options),
  };
}

/** The `FrogBotError` a thrown value stands for, by the same rules as `toProblem`. */
export function toFrogBotError(error: unknown, options: ToProblemOptions = {}): FrogBotError {
  if (isFrogBotError(error)) return error;
  if (isGatewayError(error)) return gatewayFrogBotError(error);

  if (!isPayloadError(error)) {
    return frogbotError('internal', {
      ...(options.debug && error instanceof Error ? { detail: error.message } : {}),
      cause: error,
    });
  }

  const code =
    error.message === PAYLOAD_INVALID_JSON && error.status === 400
      ? 'request.invalid-json'
      : PAYLOAD_CODES[error.name as keyof typeof PAYLOAD_CODES];

  const status = error.status ?? 500;

  const hidden = isHidden(error, status, options);

  if (hidden && (!code || error.isPublic === false)) {
    return frogbotError(code ?? (status >= 500 ? 'internal' : 'request.rejected'), {
      status,
      cause: error,
    });
  }

  if (code === 'auth.forbidden' && options.signedIn === false) {
    return frogbotError(code, { detail: error.message, hint: SIGN_IN_HINT, status, cause: error });
  }

  return frogbotError(code ?? (status >= 500 ? 'internal' : 'request.rejected'), {
    detail: error.message,
    status,
    cause: error,
  });
}

function isPayloadError(error: unknown): error is PayloadErrorLike {
  return (
    error instanceof Error &&
    'isOperational' in error &&
    error.isOperational === true &&
    (!('status' in error) || typeof error.status === 'number')
  );
}

function isHidden(error: PayloadErrorLike, status: number, options: ToProblemOptions): boolean {
  if (options.debug || error.isPublic === true) return false;

  return error.isPublic === false || status >= 500;
}

function entries(error: unknown, known: FrogBotError, options: ToProblemOptions): ProblemEntry[] {
  if (known.fields) return [{ message: known.message, data: { errors: known.fields } }];

  if (
    !isFrogBotError(error) &&
    known.code !== 'internal' &&
    isPayloadError(error) &&
    error.data &&
    !isHidden(error, error.status ?? 500, options)
  ) {
    return [{ message: known.message, name: error.name, data: error.data as ProblemEntry['data'] }];
  }

  return [{ message: known.message }];
}
