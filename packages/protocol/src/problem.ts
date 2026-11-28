/** A field a failure names: its dot path and what is wrong with it. */
export type ProblemField = {
  path: string;
  message: string;
  /** A code for this field's fault when it differs from the others, such as `forms.invalid-answer`. */
  code?: string;
};

/** One entry of `Problem.errors`, in the shape Payload's admin and toasts read. */
export type ProblemEntry = {
  message: string;
  name?: string;
  data?: { errors?: ProblemField[]; [key: string]: unknown };
};

/**
 * Every FrogBot error response: RFC 9457 problem details plus FrogBot's extensions. Branch on
 * `code`; show `detail`; follow `hint`.
 */
export type Problem<TCode extends string = string> = {
  /** The docs link for this code: `https://docs.frogbot.ai/errors#<code>`. */
  type: string;
  /** Stable `<area>.<reason>` code, such as `memory.scope-full`. */
  code: TCode;
  /** The same for every occurrence of the code. */
  title: string;
  /** The HTTP status, also on surfaces that have no HTTP response. */
  status: number;
  /** What went wrong this time: the value, field or limit involved. */
  detail: string;
  /** The next step: a field to change, a command to run, a tool to call. */
  hint?: string;
  /** The same request can succeed later without changes. */
  retryable: boolean;
  /** Seconds to wait before retrying; also sent as `Retry-After`. */
  retryAfter?: number;
  /** Also sent as `X-Request-Id`, and logged with the error. */
  requestId?: string;
  /** Facts specific to the code, such as a limit or the allowed values. */
  data?: Record<string, unknown>;
  /** Payload-compatible entries; field errors sit in `errors[i].data.errors`. */
  errors: ProblemEntry[];
};
