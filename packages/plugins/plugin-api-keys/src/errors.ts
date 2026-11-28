import { defineErrors } from 'frogbot';

/** The API key plugin's error codes. */
export const apiKeyError = defineErrors({
  'api-key.refused': {
    status: 401,
    title: 'This API key was revoked or has expired.',
    hint: 'Mint a new key, or sign in.',
    exit: 3,
  },
  'api-key.session-required': {
    status: 403,
    title: "This API key can't mint or rotate API keys.",
    hint: 'Sign in, or use a key that can mint keys.',
    exit: 3,
  },
  'api-key.not-found': {
    status: 404,
    title: 'API key not found.',
    hint: 'List your keys to find its id.',
  },
  'api-key.field-locked': {
    status: 403,
    title: "An API key can't change this field on a key.",
    hint: 'Sign in to change it.',
    exit: 3,
  },
  'api-key.expired': {
    status: 400,
    title: 'This key has expired.',
    hint: 'Mint a new key instead.',
  },
});
