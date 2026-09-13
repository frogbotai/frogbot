import {
  APIError,
  getDataLoader,
  type PayloadRequest,
  type SanitizedCollectionConfig,
} from 'payload';

import type { FrogbotRequest } from '../types/request.js';
import { checkSessionLease, coordinatesSessions, withAuthOperation } from './operation.js';

async function bufferAuthRequest(req: PayloadRequest): Promise<PayloadRequest> {
  req.signal?.throwIfAborted();
  if (!req.body) return req;
  if (!req.url) throw new APIError('Authentication request URL is missing.', 400);
  const signal = AbortSignal.any([
    AbortSignal.timeout(10_000),
    ...(req.signal ? [req.signal] : []),
  ]);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let reject!: (error: unknown) => void;
  const aborted = new Promise<never>((_, fail) => {
    reject = fail;
  });
  const abort = () => {
    const error = new APIError('Authentication request body timed out or was aborted.', 408);
    reject(error);
    void reader.cancel(error).catch(() => undefined);
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      size += value.byteLength;
      if (size > 1_048_576) {
        void reader.cancel().catch(() => undefined);
        throw new APIError('Authentication request body exceeds 1 MiB.', 413);
      }
      chunks.push(value);
    }
    signal.throwIfAborted();
    const buffered = Object.assign(
      new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: Buffer.concat(chunks),
        signal: req.signal,
      }),
      Object.fromEntries(Object.entries(req)),
    ) as PayloadRequest;
    buffered.payloadDataLoader = getDataLoader(buffered);
    return buffered;
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

export function coordinateAuthEndpoints({
  collection,
  attachFrogbot,
}: {
  collection: SanitizedCollectionConfig;
  attachFrogbot: (req: PayloadRequest) => Promise<FrogbotRequest>;
}): void {
  if (!coordinatesSessions(collection)) return;
  collection.hooks.afterOperation = [...collection.hooks.afterOperation, checkSessionLease];
  if (!collection.endpoints) return;
  collection.endpoints = collection.endpoints.map((endpoint) => {
    if (
      endpoint.method !== 'post' ||
      !['/login', '/logout', '/refresh-token', '/reset-password'].includes(endpoint.path)
    ) {
      return endpoint;
    }
    return {
      ...endpoint,
      handler: async (incoming) => {
        const req = await bufferAuthRequest(incoming);
        return withAuthOperation({
          req: await attachFrogbot(req),
          collectionSlug: collection.slug,
          operation:
            endpoint.path === '/refresh-token'
              ? 'refresh'
              : endpoint.path === '/login'
                ? 'login'
                : endpoint.path === '/reset-password'
                  ? 'resetPassword'
                  : 'logout',
          fn: async () => endpoint.handler(req),
        });
      },
    };
  });
}
