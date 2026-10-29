/** A known `frogbot share` stop: printed as one `[frogbot]` line, exiting with `code`. */
export class ShareError extends Error {
  code: 1 | 2;

  constructor(message: string, code: 1 | 2 = 1) {
    super(message);
    this.name = 'ShareError';
    this.code = code;
  }
}
