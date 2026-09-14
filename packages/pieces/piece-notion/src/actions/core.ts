import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { NotionClient } from '../client.js';
import { databaseFields, notionId } from '../config.js';
import { defineNotionAction } from '../definitions.js';
import { buildFilters } from '../filtering.js';
import { buildProperty, hasValue } from '../properties.js';
import { notionList, notionObject, notionPage, pagination } from '../schemas.js';

const args = z.object({ databaseId: notionId, fields: databaseFields });
const listOutput = z.object({ success: z.literal(true), data: z.array(notionObject), pagination });
const schemaResponse = z
  .object({ properties: z.record(z.string(), z.object({ type: z.string() }).passthrough()) })
  .passthrough();

async function properties(
  client: NotionClient,
  databaseId: string,
  fields: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const database = schemaResponse.parse(
    await client.request({ path: `/databases/${databaseId}`, signal }),
  );
  const result: Record<string, unknown> = {};

  Object.entries(fields).forEach(([name, value]) => {
    if (!hasValue(value)) return;

    const property = database.properties[name];
    const built = property ? buildProperty(property.type, value) : undefined;

    if (built) result[name] = built;
  });

  return result;
}

export const createDatabaseItem = defineNotionAction({
  slug: 'createDatabaseItem',
  description: 'Create an item in a database.',
  input: args.extend({ content: z.string().optional() }),
  output: notionPage,
  idempotent: false,
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof args> & { content?: string }, object, NotionClient>) {
    const values = await properties(
      client,
      input.databaseId,
      input.fields,
      req.signal ?? undefined,
    );
    const children = input.content
      ? [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: input.content } }] },
          },
        ]
      : [];

    const result = await client.request({
      method: 'POST',
      path: '/pages',
      body: {
        parent: { type: 'database_id', database_id: input.databaseId },
        properties: values,
        children,
      },
      signal: req.signal ?? undefined,
    });

    return notionPage.parse(result);
  },
});

export const updateDatabaseItem = defineNotionAction({
  slug: 'updateDatabaseItem',
  description: 'Update fields on a database item.',
  input: args.extend({ itemId: notionId }),
  output: notionPage,
  idempotent: true,
  async run({ client, input, req }) {
    const values = await properties(
      client,
      input.databaseId,
      input.fields,
      req.signal ?? undefined,
    );

    const result = await client.request({
      method: 'PATCH',
      path: `/pages/${input.itemId}`,
      body: { properties: values },
      signal: req.signal ?? undefined,
    });

    return notionPage.parse(result);
  },
});

export const createPage = defineNotionAction({
  slug: 'createPage',
  description: 'Create a child page.',
  input: z.object({
    pageId: notionId,
    title: z.string().optional(),
    content: z.string().optional(),
  }),
  output: notionPage,
  idempotent: false,
  async run({ client, input, req }) {
    const result = await client.request({
      method: 'POST',
      path: '/pages',
      body: {
        parent: { page_id: input.pageId },
        properties: { title: { title: [{ text: { content: input.title ?? '' } }] } },
        children: input.content
          ? [
              {
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: [{ type: 'text', text: { content: input.content } }] },
              },
            ]
          : [],
      },
      signal: req.signal ?? undefined,
    });

    return notionPage.parse(result);
  },
});

export const appendToPage = defineNotionAction({
  slug: 'appendToPage',
  description: 'Append content to a page.',
  input: z.object({ pageId: notionId, content: z.string() }),
  output: notionList,
  idempotent: false,
  async run({ client, input, req }) {
    const result = await client.request({
      method: 'PATCH',
      path: `/blocks/${input.pageId}/children`,
      body: {
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: input.content } }] },
          },
        ],
      },
      signal: req.signal ?? undefined,
    });

    return notionList.parse(result);
  },
});

function archive(slug: 'archiveDatabaseItem' | 'restoreDatabaseItem', archived: boolean) {
  return defineNotionAction({
    slug,
    description: `${archived ? 'Archive' : 'Restore'} a database item.`,
    input: z.object({ databaseId: notionId, itemId: notionId }),
    output: notionPage,
    idempotent: true,
    async run({ client, input, req }) {
      const result = await client.request({
        method: 'PATCH',
        path: `/pages/${input.itemId}`,
        body: { archived },
        signal: req.signal ?? undefined,
      });

      return notionPage.parse(result);
    },
  });
}

export const archiveDatabaseItem = archive('archiveDatabaseItem', true);
export const restoreDatabaseItem = archive('restoreDatabaseItem', false);

export const listDatabases = defineNotionAction({
  slug: 'listDatabases',
  description: 'List accessible databases.',
  input: z.object({ limit: z.number().min(1).max(100).default(10), cursor: z.string().optional() }),
  output: listOutput,
  idempotent: true,
  async run({ client, input, req }) {
    const result = notionList.parse(
      await client.request({
        method: 'POST',
        path: '/search',
        body: {
          filter: { value: 'database', property: 'object' },
          page_size: input.limit,
          start_cursor: input.cursor,
          sort: { direction: 'descending', timestamp: 'last_edited_time' },
        },
        signal: req.signal ?? undefined,
      }),
    );

    return listOutput.parse({
      success: true,
      data: result.results,
      pagination: {
        count: result.results.length,
        hasMore: result.has_more,
        nextCursor: result.next_cursor,
        limit: input.limit,
      },
    });
  },
});

export const listDatabasePages = defineNotionAction({
  slug: 'listDatabasePages',
  description: 'List pages in a database.',
  input: args
    .partial({ fields: true })
    .extend({ limit: z.number().min(1).max(100).default(10), cursor: z.string().optional() }),
  output: listOutput,
  idempotent: true,
  async run({ client, input, req }) {
    const filters = await buildFilters({
      client,
      databaseId: input.databaseId,
      fields: input.fields ?? {},
      match: 'contains',
      signal: req.signal ?? undefined,
    });
    const result = notionList.parse(
      await client.request({
        method: 'POST',
        path: `/databases/${input.databaseId}/query`,
        body: {
          page_size: input.limit,
          start_cursor: input.cursor,
          ...(filters.length > 0 ? { filter: { and: filters } } : {}),
        },
        signal: req.signal ?? undefined,
      }),
    );

    return listOutput.parse({
      success: true,
      data: result.results,
      pagination: {
        count: result.results.length,
        hasMore: result.has_more,
        nextCursor: result.next_cursor,
        limit: input.limit,
      },
    });
  },
});
