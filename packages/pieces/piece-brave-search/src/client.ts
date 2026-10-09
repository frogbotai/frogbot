import { braveSearchAuth } from './config.js';

const baseUrl = 'https://api.search.brave.com/res/v1';

type QueryValue = string | number | boolean | readonly (string | number | boolean)[];

export type BraveSearchRequest = {
  path: string;
  query?: Record<string, QueryValue | undefined>;
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

      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
        redirect: 'manual',
        signal: request.signal,
      });

      const contentType = response.headers.get('content-type') ?? '';
      const body: unknown = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        const detail = typeof body === 'string' ? body : JSON.stringify(body);

        throw new Error(`[frogbot] Brave Search request failed (${response.status}): ${detail}`);
      }

      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
      };
    },
    authorize(headers: Headers) {
      headers.set('X-Subscription-Token', apiKey);
    },
  };
}
