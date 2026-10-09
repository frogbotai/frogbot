import { airtableAuth } from './config.js';

type QueryValue = boolean | number | string | undefined;

export type AirtableClient = ReturnType<typeof createAirtableClient>;

export function createAirtableClient({ auth }: { auth: unknown }) {
  const { personalAccessToken } = airtableAuth.parse(auth);

  async function request<T>({
    method = 'GET',
    path,
    query,
    body,
    signal,
    redirect,
    baseUrl = 'https://api.airtable.com/v0',
  }: {
    method?: string;
    path: string;
    query?: Record<string, QueryValue>;
    body?: unknown;
    signal?: AbortSignal;
    redirect?: RequestRedirect;
    baseUrl?: string;
  }): Promise<T> {
    if (!path.startsWith('/') || path.split('/').includes('..')) {
      throw new Error('Airtable request path must be API-relative without parent segments.');
    }

    const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);

    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });

    const response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${personalAccessToken}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect,
      signal,
    });

    if (redirect === 'manual' && response.status >= 300 && response.status < 400) {
      throw new Error(
        `Airtable API redirected (${response.status}) to ${response.headers.get('location')}.`,
      );
    }

    if (!response.ok) {
      const detail = await response.text();

      throw new Error(
        `Airtable request failed (${response.status}): ${detail || response.statusText}`,
      );
    }

    return (await response.json()) as T;
  }

  async function listAll<T>({
    path,
    key,
    query,
    signal,
  }: {
    path: string;
    key: string;
    query?: Record<string, QueryValue>;
    signal?: AbortSignal;
  }): Promise<T[]> {
    const values: T[] = [];
    let offset: string | undefined;

    do {
      const page: Record<string, unknown> = await request({
        path,
        query: { ...query, offset },
        signal,
      });

      values.push(...((page[key] as T[] | undefined) ?? []));
      offset = typeof page.offset === 'string' ? page.offset : undefined;
    } while (offset);

    return values;
  }

  function authorize(headers: Headers) {
    headers.set('authorization', `Bearer ${personalAccessToken}`);
  }

  return { request, listAll, authorize };
}
