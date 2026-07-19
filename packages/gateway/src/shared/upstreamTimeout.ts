// Upstream deadline composition (G32).
//
// Handlers historically passed only the client abort signal into the AI SDK,
// so a provider that accepts the socket and never responds hangs the request
// until the client gives up. When `upstreamTimeoutMs` is configured, the
// upstream abort signal becomes
// `AbortSignal.any([clientSignal, AbortSignal.timeout(ms)])` (Node >= 20):
// a fired deadline aborts the upstream call while the client is still
// connected, and the resulting AbortError/TimeoutError maps to 504
// `gateway_timeout` (see `errors/clientAbort.ts` + `errors/envelope.ts`).

export type UpstreamSignal = {
  /** Composed signal to pass as the AI SDK `abortSignal`. */
  signal: AbortSignal;
  /** True once the server-side deadline fired while the client was still connected. */
  timedOut: () => boolean;
};

export function createUpstreamSignal(clientSignal: AbortSignal, timeoutMs?: number): UpstreamSignal {
  if (!timeoutMs) {
    return { signal: clientSignal, timedOut: () => false };
  }
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return {
    signal: AbortSignal.any([clientSignal, timeoutSignal]),
    timedOut: () => timeoutSignal.aborted && !clientSignal.aborted,
  };
}

/**
 * Thrown by streaming handlers when the deadline cut the upstream off before
 * the first byte. Surfaces through the route `onError` as 504 `gateway_timeout`.
 */
export function upstreamTimeoutError(): DOMException {
  return new DOMException('The upstream request timed out before producing a response.', 'TimeoutError');
}
