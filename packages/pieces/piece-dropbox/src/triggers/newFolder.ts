import type { PiecePollingTrigger, PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { DropboxClient } from '../client.js';
import { folderMetadata } from '../schemas.js';

const inputSchema = z.object({
  path: z.string().default(''),
  recursive: z.boolean().default(false),
});

const cursorSchema = z.string().min(1);
const pageSchema = z.object({
  entries: z.array(z.unknown()),
  cursor: cursorSchema,
  has_more: z.boolean(),
});

export const newFolder = {
  slug: 'newFolder',
  description: 'Emit folders created inside a watched Dropbox folder.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: inputSchema,
  output: folderMetadata,
  async run({
    client,
    input,
    cursor,
    req,
  }: PieceRunArgs<z.output<typeof inputSchema>, Record<string, never>, DropboxClient> & {
    cursor?: string;
  }) {
    if (!cursor) {
      const initial = await client.rpc(
        'files/list_folder/get_latest_cursor',
        { path: input.path, recursive: input.recursive, include_deleted: false },
        z.object({ cursor: cursorSchema }),
        req.signal ?? undefined,
      );

      return { events: [], cursor: initial.cursor };
    }

    const events: z.output<typeof folderMetadata>[] = [];
    let nextCursor = cursor;
    let hasMore = true;

    while (hasMore) {
      const page = await client.rpc(
        'files/list_folder/continue',
        { cursor: nextCursor },
        pageSchema,
        req.signal ?? undefined,
      );

      for (const entry of page.entries) {
        const folder = folderMetadata.safeParse(entry);

        if (folder.success) events.push(folder.data);
      }

      nextCursor = page.cursor;
      hasMore = page.has_more;
    }

    return { events, cursor: nextCursor };
  },
} satisfies PiecePollingTrigger<
  typeof inputSchema,
  typeof folderMetadata,
  Record<string, never>,
  DropboxClient,
  string
>;
