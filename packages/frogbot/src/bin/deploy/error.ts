/**
 * A known deploy stop: printed as one `[frogbot]` line, exiting with `code`. A target may use its own codes above 2,
 * and `details` joins the `--json` result, so an agent can tell what the stop needs.
 */
export class DeployError extends Error {
  code: number;
  details?: Record<string, unknown>;

  constructor(message: string, code = 1, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DeployError';
    this.code = code;
    this.details = details;
  }
}
