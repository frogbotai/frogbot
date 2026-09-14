import { z } from 'zod';

import { zoomAuth } from './config.js';

const baseUrl = 'https://api.zoom.us/v2';

const errorResponse = z.object({
  code: z.number().optional(),
  message: z.string().optional(),
});

export class ZoomRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    const parsed = errorResponse.safeParse(body);
    const detail = parsed.success ? parsed.data.message : undefined;

    super(`Zoom request failed with status ${status}${detail ? `: ${detail}` : ''}.`);
    this.name = 'ZoomRequestError';
  }
}

export type ZoomRequest = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
};

export type ZoomClient = ReturnType<typeof createZoomClient>;

export function createZoomClient({ auth }: { auth: unknown }) {
  const { accessToken } = zoomAuth.parse(auth);

  return async ({ method = 'GET', path, query, headers, body, signal }: ZoomRequest) => {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new Error('Zoom request path must be relative to the Zoom API.');
    }

    const url = new URL(`${baseUrl}${path}`);

    if (url.origin !== new URL(baseUrl).origin || url.username || url.password || url.hash) {
      throw new Error('Zoom request path must not change the API origin.');
    }

    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });

    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
        authorization: `Bearer ${accessToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal,
    });
    const data: unknown = response.status === 204 ? {} : await response.json();

    if (!response.ok) throw new ZoomRequestError(response.status, data);

    return data;
  };
}
