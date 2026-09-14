import { z } from 'zod';

import { type DropboxRunArgs, requestSignal } from '../client.js';
import { metadata } from '../schemas.js';

const listInput = z.object({
  path: z.string(),
  recursive: z.boolean().default(false),
  limit: z.number().int().min(1).max(2000).default(2000),
});

const listPage = z.object({
  entries: z.array(metadata),
  cursor: z.string().min(1),
  has_more: z.boolean(),
});

const listOutput = z.object({
  entries: z.array(metadata),
  cursor: z.string().min(1),
});

export const listFolder = {
  slug: 'listFolder',
  description: 'List all contents of a Dropbox folder, following pagination.',
  input: listInput,
  output: listOutput,
  idempotent: true,
  async run({ client, input, req }: DropboxRunArgs<typeof listInput>) {
    const first = await client.rpc(
      'files/list_folder',
      { path: input.path, recursive: input.recursive, limit: input.limit },
      listPage,
      requestSignal(req),
    );
    const entries = [...first.entries];
    let cursor = first.cursor;
    let hasMore = first.has_more;

    while (hasMore) {
      const page = await client.rpc(
        'files/list_folder/continue',
        { cursor },
        listPage,
        requestSignal(req),
      );

      entries.push(...page.entries);
      cursor = page.cursor;
      hasMore = page.has_more;
    }

    return { entries, cursor };
  },
};

const searchInput = z.object({
  query: z.string().min(3),
  path: z.string().default(''),
  maxResults: z.number().int().min(1).max(1000).default(100),
  orderBy: z.enum(['relevance', 'modified_time']).default('relevance'),
  fileStatus: z.enum(['active', 'deleted']).default('active'),
  filenameOnly: z.boolean().default(false),
  fileExtensions: z.string().optional(),
  fileCategories: z.string().optional(),
  accountId: z.string().optional(),
});

const searchMatch = z
  .object({
    metadata: z.discriminatedUnion('.tag', [
      z.object({ '.tag': z.literal('metadata'), metadata }),
      z.object({ '.tag': z.literal('text_content'), metadata }),
    ]),
  })
  .catchall(z.json());
const searchOutput = z
  .object({
    matches: z.array(searchMatch),
    has_more: z.boolean(),
    cursor: z.string().optional(),
  })
  .catchall(z.json());

export const searchFiles = {
  slug: 'searchFiles',
  description: 'Search Dropbox files and folders.',
  input: searchInput,
  output: searchOutput,
  idempotent: true,
  async run({ client, input, req }: DropboxRunArgs<typeof searchInput>) {
    return client.rpc(
      'files/search_v2',
      {
        query: input.query,
        options: {
          path: input.path,
          max_results: input.maxResults,
          order_by: input.orderBy,
          file_status: input.fileStatus,
          filename_only: input.filenameOnly,
          file_extensions: input.fileExtensions?.split(','),
          file_categories: input.fileCategories?.split(','),
          account_id: input.accountId,
        },
      },
      searchOutput,
      requestSignal(req),
    );
  },
};
