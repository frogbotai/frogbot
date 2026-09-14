import { z } from 'zod';

import { notionId } from '../config.js';
import { defineNotionAction } from '../definitions.js';
import { buildFilters } from '../filtering.js';
import { notionComment, notionList, notionObject } from '../schemas.js';

const findDatabaseItemOutput = z.object({
  success: z.boolean(),
  results: z.array(notionObject),
});
const blockContentOutput = z.array(notionObject);
const pageCommentsOutput = z.array(notionComment);
const findPageOutput = z.array(notionObject);

export const findDatabaseItem = defineNotionAction({
  slug: 'findDatabaseItem',
  description: 'Find database items by fields.',
  input: z.object({ databaseId: notionId, fields: z.record(z.string(), z.unknown()) }),
  output: findDatabaseItemOutput,
  idempotent: true,
  async run({ client, input, req }) {
    const filters = await buildFilters({
      client,
      databaseId: input.databaseId,
      fields: input.fields,
      match: 'equals',
      signal: req.signal ?? undefined,
    });
    const result = notionList.parse(
      await client.request({
        method: 'POST',
        path: `/databases/${input.databaseId}/query`,
        body: { filter: { and: filters } },
        signal: req.signal ?? undefined,
      }),
    );

    return findDatabaseItemOutput.parse({
      success: result.results.length > 0,
      results: result.results,
    });
  },
});

export const getBlockContent = defineNotionAction({
  slug: 'getBlockContent',
  description: 'Retrieve page or block children.',
  input: z.object({ parentId: notionId, depth: z.number().int().min(1).default(1) }),
  output: blockContentOutput,
  idempotent: true,
  async run({ client, input, req }) {
    async function children(
      parentId: string,
      depth: number,
    ): Promise<z.output<typeof notionObject>[]> {
      const blocks = await client.listAll({
        path: `/blocks/${parentId}/children`,
        signal: req.signal ?? undefined,
      });

      if (depth === 1) return blocks;

      await Promise.all(
        blocks.map(async (block) => {
          if (block.has_children !== true) return;

          block.children = await children(block.id, depth - 1);
        }),
      );

      return blocks;
    }

    return blockContentOutput.parse(await children(input.parentId, input.depth));
  },
});

export const retrieveDatabase = defineNotionAction({
  slug: 'retrieveDatabase',
  description: 'Retrieve a database structure.',
  input: z.object({ databaseId: notionId }),
  output: notionObject,
  idempotent: true,
  async run({ client, input, req }) {
    const result = await client.request({
      path: `/databases/${input.databaseId}`,
      signal: req.signal ?? undefined,
    });

    return notionObject.parse(result);
  },
});

export const getPageComments = defineNotionAction({
  slug: 'getPageComments',
  description: 'Retrieve all comments from a page.',
  input: z.object({ pageId: notionId }),
  output: pageCommentsOutput,
  idempotent: true,
  async run({ client, input, req }) {
    const values = await client.listAll({
      path: '/comments',
      query: { block_id: input.pageId },
      signal: req.signal ?? undefined,
    });

    return pageCommentsOutput.parse(values);
  },
});

export const findPage = defineNotionAction({
  slug: 'findPage',
  description: 'Find pages by title.',
  input: z.object({
    title: z.string().min(1),
    exactMatch: z.boolean().default(false),
    limit: z.number().min(1).max(100).default(10),
  }),
  output: findPageOutput,
  idempotent: true,
  async run({ client, input, req }) {
    const pages = await client.listAll({
      path: '/search',
      body: {
        query: input.title,
        filter: { property: 'object', value: 'page' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: input.limit,
      },
      signal: req.signal ?? undefined,
    });
    const query = input.title.toLowerCase();
    const matches = pages.filter((page) => {
      const properties = z.record(z.string(), z.unknown()).safeParse(page.properties);

      if (!properties.success) return false;

      const titleProperty = Object.values(properties.data).find((property) => {
        return (
          z.object({ type: z.string() }).passthrough().safeParse(property).data?.type === 'title'
        );
      });
      const title = z
        .object({ title: z.array(z.object({ plain_text: z.string() }).passthrough()) })
        .passthrough()
        .safeParse(titleProperty);
      const value = title.success ? title.data.title[0]?.plain_text.toLowerCase() : undefined;

      return input.exactMatch ? value === query : value?.includes(query) === true;
    });

    return findPageOutput.parse(matches.slice(0, input.limit));
  },
});
