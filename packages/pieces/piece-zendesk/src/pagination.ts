import { z } from 'zod';

import type { ZendeskClient } from './client.js';

const minute = 60_000;

const exportFields = {
  startTime: z.iso.datetime({ offset: true }).optional().meta({
    description:
      'Where a first export starts, at least a minute ago, such as 1970-01-01T00:00:00Z for everything.',
  }),
  cursor: z
    .string()
    .min(1)
    .optional()
    .meta({ description: "The previous page's nextCursor, kept between syncs." }),
};

type ExportFields = z.output<z.ZodObject<typeof exportFields>>;

/** `startTime` or `cursor`, exactly one. Zendesk refuses a start time under a minute old. */
export function exportInput<T extends z.ZodRawShape>(shape: T) {
  return z.object({ ...shape, ...exportFields }).superRefine((value, ctx) => {
    const { startTime, cursor } = value as ExportFields;

    if ((startTime === undefined) === (cursor === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Pass startTime for a first export or cursor to continue one, not both.',
      });
    } else if (startTime !== undefined && Date.parse(startTime) > Date.now() - minute) {
      ctx.addIssue({
        code: 'custom',
        path: ['startTime'],
        message: 'startTime must be at least a minute ago.',
      });
    }
  });
}

/**
 * `{ data, pagination }`. `hasMore` is false at the end of the stream; `nextCursor` is still set
 * there, so the next sync carries on from it.
 */
export function exportOutput<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    pagination: z.object({
      count: z.number(),
      hasMore: z.boolean(),
      nextCursor: z.string().nullable(),
    }),
  });
}

type ExportRequest<T> = {
  path: string;
  key: string;
  item: z.ZodType<T>;
  kind: 'cursor' | 'time';
  input: ExportFields;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
};

const exportMeta = z.object({
  after_cursor: z.string().nullish(),
  end_time: z.number().nullish(),
  end_of_stream: z.boolean().optional(),
  next_page: z.string().nullish(),
});

const listMeta = z.object({
  meta: z.object({ has_more: z.boolean(), after_cursor: z.string().nullish() }).optional(),
});

function records<T>(key: string, item: z.ZodType<T>, body: unknown): T[] {
  return z.object({ [key]: z.array(item) }).parse(body)[key];
}

/** One page of an incremental export. Help Center's has no `end_of_stream`, only `next_page`. */
export async function exportPage<T>(
  client: ZendeskClient,
  { path, key, item, kind, input, query, signal }: ExportRequest<T>,
) {
  const start =
    input.startTime === undefined ? undefined : Math.floor(Date.parse(input.startTime) / 1000);

  const body = await client.json({
    path,
    query: {
      ...query,
      ...(kind === 'cursor'
        ? { start_time: start, cursor: input.cursor }
        : { start_time: start ?? input.cursor }),
    },
    signal,
  });

  const data = records(key, item, body);
  const page = exportMeta.parse(body);
  const next = kind === 'cursor' ? page.after_cursor : page.end_time;

  return {
    data,
    pagination: {
      count: data.length,
      hasMore: page.end_of_stream === undefined ? Boolean(page.next_page) : !page.end_of_stream,
      nextCursor: next === null || next === undefined ? null : String(next),
    },
  };
}

/** The `limit` and `cursor` every list takes. */
export const listInput = {
  limit: z.number().int().min(1).max(100).default(100),
  cursor: z
    .string()
    .min(1)
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

type ListRequest<T> = {
  path: string;
  key: string;
  item: z.ZodType<T>;
  limit: number;
  cursor?: string;
  paginated: boolean;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
};

/** One page of a cursor-paginated list: `page[size]`/`page[after]` and `meta`. */
export async function listPage<T>(
  client: ZendeskClient,
  { path, key, item, limit, cursor, paginated, query, signal }: ListRequest<T>,
) {
  const body = await client.json({
    path,
    query: paginated ? { ...query, 'page[size]': limit, 'page[after]': cursor } : query,
    signal,
  });

  const data = records(key, item, body);
  const page = listMeta.parse(body);
  const hasMore = paginated && (page.meta?.has_more ?? false);

  return {
    data,
    pagination: {
      count: data.length,
      hasMore,
      nextCursor: hasMore ? (page.meta?.after_cursor ?? null) : null,
      limit,
    },
  };
}
