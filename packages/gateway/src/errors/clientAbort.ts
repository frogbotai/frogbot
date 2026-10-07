export class ClientAbortError extends Error {
  override readonly name = 'ClientAbortError';
  readonly status = 499 as const;

  constructor(message = 'Client closed request') {
    super(message);
  }
}

export function isClientAbort(err: unknown, requestSignal?: AbortSignal): boolean {
  if (err instanceof ClientAbortError) return true;
  if ((err instanceof Error || err instanceof DOMException) && err.name === 'AbortError') {
    return requestSignal?.aborted === true;
  }

  return false;
}

/**
 * Upstream abort/timeout classification: an `AbortError` (fetch layer) or
 * `TimeoutError` (`AbortSignal.timeout` / AI SDK timeout utilities) thrown
 * while the client is still connected. Callers check `isClientAbort` first;
 * anything left here is an upstream fault → 504 `gateway_timeout`.
 */
export function isUpstreamAbortError(err: unknown): err is Error | DOMException {
  return (
    (err instanceof Error || err instanceof DOMException) &&
    (err.name === 'AbortError' || err.name === 'TimeoutError')
  );
}
