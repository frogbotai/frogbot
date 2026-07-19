// Fetch wrapper: JSON POST → parsed response.
// Used by gateway integration and golden tests.

import type { Hono } from 'hono';

export type JsonResponse<T = unknown> = {
  status: number;
  headers: Headers;
  body: T;
};

export async function postJson<T = unknown>(
  app: Hono,
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<JsonResponse<T>> {
  const res = await app.request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T;
  return { status: res.status, headers: res.headers, body: data };
}
