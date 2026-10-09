export type AttioRequest = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  path: string;
  query?: Record<string, unknown>;
  redirect?: RequestRedirect;
  signal?: AbortSignal;
};

export type AttioResponse = unknown;

export function createAttioClient({ auth }: { auth: unknown }) {
  const { accessToken } = attioAuth.parse(auth);

  return {
    async request<T = AttioResponse>({
      body,
      headers,
      method = 'GET',
      path,
      query,
      redirect,
      signal,
    }: AttioRequest): Promise<T> {
      if (!path.startsWith('/') || path.split('/').includes('..')) {
        throw new Error('Attio request path must be an API-relative path without parent segments.');
      }

      const url = new URL(`https://api.attio.com/v2${path.startsWith('/') ? path : `/${path}`}`);

      const requestHeaders = new Headers(headers);

      requestHeaders.set('Authorization', `Bearer ${accessToken}`);

      if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');

      for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }

      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect,
        signal,
      });

      if (redirect === 'manual' && response.status >= 300 && response.status < 400) {
        throw new Error(
          `Attio API redirected (${response.status}) to ${response.headers.get('location')}.`,
        );
      }

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          result && typeof result === 'object' && 'message' in result
            ? result.message
            : response.statusText;

        throw new Error(`Attio request failed (${response.status}): ${String(message)}`);
      }

      return result as T;
    },
    authorize(headers: Headers) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    },
  };
}

export type AttioClient = ReturnType<typeof createAttioClient>;

import { attioAuth } from './config.js';
