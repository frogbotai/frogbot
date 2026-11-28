import { defineErrors } from 'frogbot';

/** The two-factor plugin's error codes. */
export const twoFactorError = defineErrors({
  'two-factor.wrong-code': {
    status: 401,
    title: "That code didn't work.",
    hint: 'Enter the current code from the authenticator app, or a recovery code.',
    exit: 3,
  },
  'two-factor.locked': {
    status: 429,
    title: 'Too many wrong codes.',
    hint: 'Wait the seconds in `Retry-After`, then try again.',
    retryable: true,
  },
  'two-factor.expired': {
    status: 400,
    title: 'This sign-in expired or was already used.',
    hint: 'Sign in again.',
  },
  'two-factor.pending-missing': {
    status: 400,
    title: 'No pending sign-in.',
    hint: 'Send the pending sign-in cookie from the sign-in response, or sign in again.',
  },
  'two-factor.code-missing': {
    status: 400,
    title: 'The code is missing.',
    hint: 'Send the code as a string in `code`, e.g. {"code":"123456"}.',
    exit: 2,
  },
  'two-factor.body-unreadable': {
    status: 400,
    title: "The body couldn't be read.",
    hint: 'Send JSON or a URL-encoded form body, e.g. {"code":"123456"}.',
    exit: 2,
  },
  'two-factor.already-on': {
    status: 409,
    title: 'Two-factor sign-in is already on.',
    hint: 'Turn it off first to set it up again.',
  },
  'two-factor.off': {
    status: 400,
    title: 'Two-factor sign-in is off.',
    hint: 'Turn it on first.',
  },
  'two-factor.sign-in-required': {
    status: 403,
    title: 'Two-factor sign-in is required.',
    hint: 'Sign in through the two-factor flow: POST to the login endpoint, then send the code.',
    exit: 3,
  },
  'two-factor.required': {
    status: 403,
    title: 'Two-factor sign-in is required for this account.',
    hint: 'Keep it on, or ask an admin to change the requirement.',
    exit: 3,
  },
  'two-factor.not-allowed': {
    status: 403,
    title: "This user can't do that.",
    hint: 'Use an account that the two-factor access rules allow.',
    exit: 3,
  },
});

/** A two-factor error code. */
export type TwoFactorErrorCode = Parameters<typeof twoFactorError>[0];
