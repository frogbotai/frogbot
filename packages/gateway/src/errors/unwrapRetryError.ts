import { RetryError } from 'ai';

export function unwrapRetryError(err: unknown): unknown {
  return RetryError.isInstance(err) ? err.lastError : err;
}
