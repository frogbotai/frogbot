// Unwraps an AI SDK `RetryError` down to the cause of its last retry
// attempt. `RetryError` (from the `ai` package's exponential-backoff retry
// loop, thrown once `maxRetries` is exhausted) buries the real upstream
// failure in `err.lastError` — callers that classify errors by type
// (`APICallError.isInstance`, status code, etc.) need to see through it.
//
// Shared by `envelope.ts` and `normalizeAiSdkError.ts` to avoid duplicating
// the `RetryError.isInstance(err) ? err.lastError : err` check.

import { RetryError } from 'ai';

export function unwrapRetryError(err: unknown): unknown {
  return RetryError.isInstance(err) ? err.lastError : err;
}
