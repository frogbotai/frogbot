import { type FrogBotError, isFrogBotError } from '../../errors/FrogBotError.js';

/** Whether `error` is a failed OAuth step: an `oauth.*` code. */
export function isOAuthError(error: unknown): error is FrogBotError {
  return isFrogBotError(error) && error.code.startsWith('oauth.');
}
