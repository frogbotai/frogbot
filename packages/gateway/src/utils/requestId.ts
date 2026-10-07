const requestIds = new WeakMap<Request, string>();

export function ensureRequestId(request: Request): string {
  const existing = requestIds.get(request);
  if (existing) return existing;

  const requestId = `req_${crypto.randomUUID()}`;
  requestIds.set(request, requestId);

  return requestId;
}
