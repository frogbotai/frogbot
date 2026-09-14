import { z } from 'zod';

export const notionObject = z
  .object({
    object: z.string(),
    id: z.string(),
  })
  .passthrough();

export const notionPage = notionObject.extend({
  created_time: z.string().optional(),
  last_edited_time: z.string().optional(),
  archived: z.boolean().optional(),
  url: z.string().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export const notionComment = notionObject.extend({
  created_time: z.string(),
  last_edited_time: z.string().optional(),
  discussion_id: z.string().optional(),
  rich_text: z.array(z.unknown()).optional(),
});

export const notionList = z
  .object({
    object: z.literal('list'),
    results: z.array(notionObject),
    has_more: z.boolean(),
    next_cursor: z.string().nullable(),
  })
  .passthrough();

export const pagination = z.object({
  count: z.number(),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
  limit: z.number(),
});
