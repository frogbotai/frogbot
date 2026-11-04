import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { listOutput, listPage, pageInput } from '../pagination.js';

const folder = z
  .object({
    id: z.string(),
    displayName: z.string().nullish(),
    parentFolderId: z.string().nullish(),
    childFolderCount: z.number().nullish(),
    totalItemCount: z.number().nullish(),
    unreadItemCount: z.number().nullish(),
  })
  .passthrough();

export const listMailFolders = defineAction({
  slug: 'listMailFolders',
  description: 'List one page of mail folders, at the top level or inside a parent folder.',
  input: z.object({
    parentFolderId: identifier
      .optional()
      .meta({ description: 'List the child folders of this folder.' }),
    ...pageInput,
  }),
  output: listOutput(folder),
  idempotent: true,
  async run({ client, input, req }) {
    return listPage(client, folder, {
      path: input.parentFolderId
        ? `${client.mailbox}/mailFolders/${encodeURIComponent(input.parentFolderId)}/childFolders`
        : `${client.mailbox}/mailFolders`,
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});
