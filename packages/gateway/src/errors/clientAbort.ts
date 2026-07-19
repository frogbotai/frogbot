// Client abort marker.
//
// Thrown by the SSE stream reader when the client disconnects. Handlers
// translate this into HTTP status 499 (nginx convention: "Client Closed
// Request") so operators can distinguish user aborts from server errors
// in metrics/logs.

export class ClientAbortError extends Error {
  override readonly name = 'ClientAbortError';
  readonly status = 499 as const;

  constructor(message = 'Client closed request') {
    super(message);
  }
}

export function isClientAbort(err: unknown, requestSignal?: AbortSignal): boolean {
  if (err instanceof ClientAbortError) return true;
  // DOMException / AbortError from the fetch layer. Only a client abort when
  // the inbound request signal actually aborted — a bare AbortError with a
  // still-connected client is an upstream abort (e.g. a fired server-side
  // deadline) and must NOT map to 499. See `isUpstreamAbortError`.
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
