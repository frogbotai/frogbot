const requestIds = new WeakMap<Request, string>();

export function ensureRequestId(request: Request): string {
  const existing = requestIds.get(request);
  if (existing) return existing;

  // Always mint a gateway-owned unique id; never echo the client-supplied
  // `x-request-id` as our own. Trusting the inbound value lets a client inject
  // arbitrary strings (path traversal, CRLF/log injection, JSON quotes, null
  // bytes) into response headers, logs, and span attributes, and lets two
  // clients send identical values that collide in the span map and
  // cross-attribute metrics. A fresh `req_`-prefixed UUID is safe by charset
  // and unique by construction.
  const requestId = `req_${crypto.randomUUID()}`;
  requestIds.set(request, requestId);
  return requestId;
}
