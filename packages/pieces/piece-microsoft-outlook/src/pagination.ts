import { z } from 'zod';

import type { MicrosoftOutlookClient } from './client.js';

export const pageInput = {
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z
    .string()
    .optional()
    .meta({ description: "The previous page's nextCursor; the other filters are then ignored." }),
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

/** One page of a Graph list in Notion's list shape, continuing from `cursor` (an `@odata.nextLink`). */
export async function listPage<T>(
  client: MicrosoftOutlookClient,
  item: z.ZodType<T>,
  args: {
    path: string;
    query?: Record<string, string | number | undefined>;
    headers?: Record<string, string>;
    limit: number;
    cursor?: string;
    signal?: AbortSignal;
  },
) {
  const result = await client.page(args.cursor ?? args.path, item, {
    query: args.cursor ? undefined : { ...args.query, $top: args.limit },
    headers: args.headers,
    signal: args.signal,
  });

  return {
    data: result.value,
    pagination: {
      count: result.value.length,
      hasMore: result.nextLink !== null,
      nextCursor: result.nextLink,
      limit: args.limit,
    },
  };
}
