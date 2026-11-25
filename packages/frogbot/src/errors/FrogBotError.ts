import type { ProblemField } from '@frogbotai/protocol';
import { APIError } from 'payload';

/** Where every error code's docs live: `${ERRORS_DOCS_URL}#<code>`. */
export const ERRORS_DOCS_URL = 'https://docs.frogbot.ai/errors';

/** One code in a catalog passed to `defineErrors`. */
export type ErrorDefinition = {
  /** The HTTP status sent for this code. */
  status: number;
  /** A short sentence, the same for every occurrence. */
  title: string;
  /** The next step for whoever called: a field to change, a command, a tool. */
  hint: string;
  /** The same request can succeed later without changes. Defaults to `false`. */
  retryable?: boolean;
  /** The CLI's exit code for this failure. Defaults to `1`. */
  exit?: number;
};

/** What one occurrence adds to its code's definition. */
export type ErrorDetails = {
  /** What went wrong this time. Defaults to the code's title. */
  detail?: string;
  /** Replaces the definition's hint when this occurrence has a more exact next step. */
  hint?: string;
  /** Facts the caller can act on, such as a limit or the allowed values. */
  data?: Record<string, unknown>;
  /** The fields at fault, shown beside each field in the admin. */
  fields?: ProblemField[];
  /** Seconds to wait before retrying; sent as `Retry-After`. */
  retryAfter?: number;
  /** Replaces the definition's status, for codes that cover several statuses. */
  status?: number;
  /** Response headers to send with this failure, such as `Cache-Control` or `Set-Cookie`. */
  headers?: HeadersInit;
  cause?: unknown;
};

/**
 * A known failure with a stable code. Its message is always sent, so write it for the caller. Raise one with a factory from `defineErrors`, such as
 * `frogbotError('memory.scope-full', { detail })`; every surface turns it into a `Problem`.
 */
export class FrogBotError<TCode extends string = string> extends APIError<Record<
  string,
  unknown
> | null> {
  readonly code: TCode;
  readonly title: string;
  readonly hint: string;
  readonly retryable: boolean;
  readonly retryAfter?: number;
  readonly fields?: ProblemField[];
  readonly headers?: Headers;
  readonly exit: number;

  constructor(code: TCode, definition: ErrorDefinition, details: ErrorDetails = {}) {
    const status = details.status ?? definition.status;

    super(details.detail ?? definition.title, status, details.data ?? null, true);

    this.name = 'FrogBotError';
    this.code = code;
    this.title = definition.title;
    this.hint = details.hint ?? definition.hint;
    this.retryable = definition.retryable ?? false;
    this.exit = definition.exit ?? 1;

    if (details.retryAfter !== undefined) this.retryAfter = details.retryAfter;
    if (details.fields?.length) this.fields = details.fields;
    if (details.headers) this.headers = new Headers(details.headers);

    if (details.cause !== undefined) this.cause = details.cause;
    else delete this.cause;
  }
}

/** The same failure with more response headers, such as a cookie to clear. Keeps its own code. */
export function withHeaders<TCode extends string>(
  error: FrogBotError<TCode>,
  headers: HeadersInit,
): FrogBotError<TCode> {
  const merged = new Headers(error.headers);

  new Headers(headers).forEach((value, key) => merged.set(key, value));

  return new FrogBotError(
    error.code,
    {
      status: error.status,
      title: error.title,
      hint: error.hint,
      retryable: error.retryable,
      exit: error.exit,
    },
    {
      detail: error.message,
      ...(error.data ? { data: error.data } : {}),
      ...(error.fields ? { fields: error.fields } : {}),
      ...(error.retryAfter !== undefined ? { retryAfter: error.retryAfter } : {}),
      headers: merged,
      cause: error,
    },
  );
}

/** A typed factory for one catalog's codes. Its `definitions` feed the generated errors page. */
export type ErrorFactory<TCode extends string> = ((
  code: TCode,
  details?: ErrorDetails | string,
) => FrogBotError<TCode>) & { readonly definitions: Readonly<Record<TCode, ErrorDefinition>> };

/**
 * Declares a catalog of error codes and returns the factory that raises them. Core's is
 * `frogbotError`; a plugin declares its own codes, each starting with the plugin's name.
 */
export function defineErrors<const TDefinitions extends Record<string, ErrorDefinition>>(
  definitions: TDefinitions,
): ErrorFactory<keyof TDefinitions & string> {
  type Code = keyof TDefinitions & string;

  const factory = (code: Code, details?: ErrorDetails | string) =>
    new FrogBotError(
      code,
      definitions[code],
      typeof details === 'string' ? { detail: details } : details,
    );

  return Object.assign(factory, { definitions });
}

/**
 * Whether a value is a `FrogBotError`, optionally with one code. Checks the shape, so an error
 * from another installed copy of `frogbot` matches too.
 */
export function isFrogBotError<TCode extends string = string>(
  error: unknown,
  code?: TCode,
): error is FrogBotError<TCode> {
  if (!(error instanceof Error) || error.name !== 'FrogBotError') return false;

  const candidate = error as Partial<FrogBotError>;

  if (typeof candidate.code !== 'string' || typeof candidate.status !== 'number') return false;

  return code === undefined || candidate.code === code;
}
