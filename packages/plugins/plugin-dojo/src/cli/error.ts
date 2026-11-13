/** Exit 3: the command needs a Dojo sign-in that nobody is here to give. */
export const needsSignIn = 3;

/** Exit 4: the command needs a payment that nobody is here to make. */
export const needsPayment = 4;

/** What a person has to do before the command can carry on, for `--json`. */
export type NeededStep = { needs: 'sign-in' | 'payment'; link?: string; userCode?: string };

/** A known `frogbot share` stop: printed as one `[frogbot]` line, exiting with `code`. */
export class ShareError extends Error {
  code: 1 | 2 | typeof needsSignIn | typeof needsPayment;
  step?: NeededStep;

  constructor(message: string, code: ShareError['code'] = 1, step?: NeededStep) {
    super(message);
    this.name = 'ShareError';
    this.code = code;
    this.step = step;
  }
}
