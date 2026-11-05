import { isContextOverflow } from '@frogbotai/gateway/errors';
import { APICallError, RetryError } from 'ai';

/** Whether a model call failed because its prompt is over the model's context window. */
export function isOverflowError(error: unknown): boolean {
  const cause = RetryError.isInstance(error) ? error.lastError : error;

  if (!APICallError.isInstance(cause)) return false;

  return isContextOverflow({
    message: cause.message,
    status: cause.statusCode,
    body: cause.data ?? parseBody(cause.responseBody),
  });
}

function parseBody(body: string | undefined): unknown {
  if (!body) return undefined;

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}
