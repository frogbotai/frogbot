/** A known deploy stop: printed as one `[frogbot]` line, exiting with `code`. */
export class DeployError extends Error {
  code: 1 | 2;

  constructor(message: string, code: 1 | 2 = 1) {
    super(message);
    this.name = 'DeployError';
    this.code = code;
  }
}
