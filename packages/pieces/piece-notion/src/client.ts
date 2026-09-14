import { z } from 'zod';

import { notionAuth } from './config.js';
import { notionList } from './schemas.js';

type QueryValue = boolean | number | string | undefined;

export type NotionClient = ReturnType<typeof createNotionClient>;

export function createNotionClient({ auth }: { auth: unknown }) {
  const { accessToken } = notionAuth.parse(auth);

  async function request({
    method = 'GET',
    path,
    query,
    body,
    signal,
  }: {
    method?: string;
    path: string;
    query?: Record<string, QueryValue>;
    body?: unknown;
    signal?: AbortSignal;
  }) {
    if (!path.startsWith('/') || path.split('/').includes('..')) {
      throw new Error('Notion request path must be API-relative without parent segments.');
    }

    const url = new URL(`https://api.notion.com/v1${path}`);

    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });

    const response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'notion-version': '2022-02-22',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });

    const value: unknown = await response.json();

    if (!response.ok) {
      const detail = z.object({ message: z.string().optional() }).passthrough().safeParse(value);

      throw new Error(
        `Notion request failed (${response.status}): ${detail.success ? (detail.data.message ?? response.statusText) : response.statusText}`,
      );
    }

    return value;
  }

  async function listAll({
    path,
    body,
    query,
    signal,
  }: {
    path: string;
    body?: Record<string, unknown>;
    query?: Record<string, QueryValue>;
    signal?: AbortSignal;
  }) {
    const results: z.output<typeof notionList>['results'] = [];
    let cursor: string | undefined;

    do {
      const value = body
        ? await request({ method: 'POST', path, body: { ...body, start_cursor: cursor }, signal })
        : await request({ path, query: { ...query, start_cursor: cursor }, signal });
      const page = notionList.parse(value);

      results.push(...page.results);
      cursor = page.next_cursor ?? undefined;
    } while (cursor);

    return results;
  }

  return { request, listAll };
}
