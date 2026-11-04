import { z } from 'zod';

/** The `limit` and `cursor` every paged read takes. */
export const pageInput = {
  limit: z.number().int().min(1).max(100).default(100),
  cursor: z
    .string()
    .min(1)
    .optional()
    .meta({ description: "The previous page's nextCursor. Keep the other inputs the same." }),
};

/** `{ results, nextCursor }`, where `nextCursor` is `null` on the last page. */
export function pageOutput<T extends z.ZodType>(item: T) {
  return z.object({ results: z.array(item), nextCursor: z.string().nullable() });
}

/** HubSpot's `paging` object. Only `next.after` is used; `link` is deprecated. */
export const paging = z
  .object({ next: z.object({ after: z.string() }).optional() })
  .optional()
  .transform((value) => value?.next?.after ?? null);

/** Reads one `{ results, paging }` page and maps `paging.next.after` to `nextCursor`. */
export function cursorPage<T extends z.ZodType>(item: T) {
  return z
    .object({ results: z.array(item), paging })
    .transform(({ results, paging: nextCursor }) => ({ results, nextCursor }));
}
