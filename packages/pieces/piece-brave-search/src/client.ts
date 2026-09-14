import { braveSearchAuth } from './config.js';

const baseUrl = 'https://api.search.brave.com/res/v1';

type QueryValue = string | number | boolean | readonly (string | number | boolean)[];

export type BraveSearchRequest = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, QueryValue | undefined>;
  headers?: Record<string, string>;
  body?: BodyInit;
  timeout?: number;
  followRedirects?: boolean;
  responseIsBinary?: boolean;
  failsafe?: boolean;
  signal?: AbortSignal;
};

export type BraveSearchResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

export type BraveSearch = ReturnType<typeof createBraveSearchClient>;

export function createBraveSearchClient({ auth }: { auth: unknown }) {
  const { apiKey } = braveSearchAuth.parse(auth);

  return {
    async request(request: BraveSearchRequest): Promise<BraveSearchResponse> {
      if (!request.path.startsWith('/') || request.path.split('/').includes('..')) {
        throw new Error('Brave Search request path must be API-relative without parent segments.');
      }

      const url = new URL(`${baseUrl}${request.path}`);

      if (url.origin !== new URL(baseUrl).origin) {
        throw new Error('Brave Search request path must not change the API origin.');
      }

      Object.entries(request.query ?? {}).forEach(([key, value]) => {
        const values = Array.isArray(value) ? value : [value];

        values.forEach((item) => {
          if (item !== undefined) url.searchParams.append(key, String(item));
        });
      });

      const controller = new AbortController();
      const abort = () => controller.abort(request.signal?.reason);

      request.signal?.addEventListener('abort', abort, { once: true });

      if (request.signal?.aborted) abort();
      const timeout = request.timeout
        ? setTimeout(() => controller.abort(), request.timeout * 1_000)
        : undefined;

      try {
        const response = await fetch(url, {
          method: request.method ?? 'GET',
          headers: (() => {
            const headers = new Headers(request.headers);

            if (!headers.has('Accept')) headers.set('Accept', 'application/json');

            headers.set('X-Subscription-Token', apiKey);

            return headers;
          })(),
          body: request.body,
          redirect: 'manual',
          signal: controller.signal,
        });
        const contentType = response.headers.get('content-type') ?? '';
        const body = request.responseIsBinary
          ? new Uint8Array(await response.arrayBuffer())
          : contentType.includes('application/json')
            ? await response.json()
            : await response.text();
        const result = {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body,
        };

        if (!response.ok && !request.failsafe) {
          const detail = typeof body === 'string' ? body : JSON.stringify(body);

          throw new Error(`[frogbot] Brave Search request failed (${response.status}): ${detail}`);
        }

        return result;
      } finally {
        if (timeout) clearTimeout(timeout);

        request.signal?.removeEventListener('abort', abort);
      }
    },
  };
}
