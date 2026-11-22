export const firstUserEmail = 'first@example.com';

/** `SIGN_IN_SETUP` value for the server whose users collection turns passwords off. */
export const signInOnly = 'sign-in-only';

/**
 * `SIGN_IN_SETUP` value for the server whose users' `role` is required (`bio` stays optional) and
 * whose owners must use two-factor. The fields exist on every server so they share one schema.
 */
export const firstUserFields = 'first-user-fields';
