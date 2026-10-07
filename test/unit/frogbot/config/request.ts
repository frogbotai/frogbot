import type { PayloadRequest } from 'payload';

// A request with the fields FrogBot's config hooks and endpoints read. Payload builds a complete
// one (i18n, the data loader) only for a booted instance, so the rest stays unset.
export function makeRequest(payload: object): PayloadRequest {
  const req: Pick<PayloadRequest, 'context' | 'headers' | 'payloadAPI' | 'query'> & {
    payload: object;
  } = { context: {}, headers: new Headers(), payload, payloadAPI: 'local', query: {} };

  return req as unknown as PayloadRequest;
}
