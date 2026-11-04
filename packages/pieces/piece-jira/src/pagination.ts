import { z } from 'zod';

import type { JiraClient, JiraRequest } from './client.js';

export const pageInput = {
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z
    .string()
    .optional()
    .meta({ description: "The previous page's nextCursor. Keep the other inputs the same." }),
};

export function listOutput<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    pagination: z.object({
      count: z.number(),
      hasMore: z.boolean(),
      nextCursor: z.string().nullable(),
      limit: z.number(),
    }),
  });
}

/** Notion's list shape for one page of Jira records. */
export function listPage<T>(data: T[], limit: number, nextCursor: string | null) {
  return {
    data,
    pagination: { count: data.length, hasMore: nextCursor !== null, nextCursor, limit },
  };
}

const offsetMeta = z.object({
  startAt: z.number().optional(),
  total: z.number().optional(),
  isLast: z.boolean().optional(),
});

const tokenMeta = z.object({ nextPageToken: z.string().nullish(), isLast: z.boolean().optional() });

function offset(cursor: string | undefined) {
  if (cursor === undefined) return 0;
  if (!/^\d+$/.test(cursor)) throw new Error(`Jira cursor '${cursor}' is not a page offset.`);

  return Number(cursor);
}

type PageArgs = Omit<JiraRequest, 'query'> & {
  query?: JiraRequest['query'];
  limit: number;
  cursor?: string;
};

/**
 * One page of a `startAt` list. `key` names the list in the response; without it the response
 * is the list itself, and a full page means there may be more.
 */
export async function offsetPage<T>(
  client: JiraClient,
  item: z.ZodType<T>,
  { limit, cursor, key, ...request }: PageArgs & { key?: string },
) {
  const startAt = offset(cursor);
  const query = { ...request.query, startAt, maxResults: limit };

  if (!key) {
    const data = await client.request(z.array(item), { ...request, query });

    return listPage(data, limit, data.length >= limit ? String(startAt + data.length) : null);
  }

  const result = await client.request(offsetMeta.passthrough(), { ...request, query });
  const data = z.array(item).parse(result[key]);
  const next = (result.startAt ?? startAt) + data.length;
  const more =
    data.length > 0 &&
    (result.isLast !== undefined
      ? !result.isLast
      : result.total !== undefined
        ? next < result.total
        : data.length >= limit);

  return listPage(data, limit, more ? String(next) : null);
}

/** One page of a `nextPageToken` list, from a POST whose body takes `maxResults` and the token. */
export async function tokenPage<T>(
  client: JiraClient,
  item: z.ZodType<T>,
  { limit, cursor, key, body, ...request }: PageArgs & { key: string; body: object },
) {
  const result = await client.request(tokenMeta.passthrough(), {
    ...request,
    method: 'POST',
    body: { ...body, maxResults: limit, ...(cursor ? { nextPageToken: cursor } : {}) },
  });

  const data = z.array(item).parse(result[key]);
  const token = result.isLast ? null : (result.nextPageToken ?? null);

  return listPage(data, limit, token);
}

/** A page of a list Jira returns whole, continuing at the offset in `cursor`. */
export function slicePage<T>(items: T[], { limit, cursor }: { limit: number; cursor?: string }) {
  const startAt = offset(cursor);
  const data = items.slice(startAt, startAt + limit);
  const next = startAt + data.length;

  return listPage(data, limit, next < items.length ? String(next) : null);
}
