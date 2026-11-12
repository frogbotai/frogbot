/** What a `DeployError` adds to the `--json` result besides its message. */
export type DeployErrorDetails = {
  /** Stable, for scripts reading `--json`: `COMMAND_FAILED`, `DOJO_UNREACHABLE`, or Dojo's own `payment_required`. */
  code?: string;
  /** More fields for `--json`, such as `status`, `url` or `deploymentId`. */
  fields?: Record<string, unknown>;
  cause?: unknown;
};

/** A known deploy stop: printed as one `[frogbot]` line, exiting with `exitCode`. */
export class DeployError extends Error {
  exitCode: 1 | 2;
  /** The `--json` result's `code`: the details' code, or `USAGE_ERROR` for exit 2 and `FAILED` otherwise. */
  code: string;
  fields: Record<string, unknown>;

  constructor(
    message: string,
    exitCode: 1 | 2 = 1,
    { code, fields = {}, cause }: DeployErrorDetails = {},
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'DeployError';
    this.exitCode = exitCode;
    this.code = code ?? (exitCode === 2 ? 'USAGE_ERROR' : 'FAILED');
    this.fields = fields;
  }
}
