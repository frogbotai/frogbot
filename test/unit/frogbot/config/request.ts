import type { PayloadRequest } from 'payload';

export function makeRequest(payload: object): PayloadRequest {
  const req: Pick<PayloadRequest, 'context' | 'headers' | 'payloadAPI' | 'query'> & {
    payload: object;
  } = { context: {}, headers: new Headers(), payload, payloadAPI: 'local', query: {} };

  return req as unknown as PayloadRequest;
}
