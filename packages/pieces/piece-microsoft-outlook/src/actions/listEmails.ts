import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { message } from '../mail.js';
import { listOutput, listPage, pageInput } from '../pagination.js';

export const listEmails = defineAction({
  slug: 'listEmails',
  description:
    'List one page of emails in a folder, newest first, with body, recipients and conversation id.',
  input: z.object({
    folderId: identifier
      .default('inbox')
      .meta({ description: 'A folder id, or a well-known name such as inbox or sentitems.' }),
    receivedAfter: z.iso.datetime({ offset: true }).optional(),
    ...pageInput,
  }),
  output: listOutput(message),
  idempotent: true,
  async run({ client, input, req }) {
    return listPage(client, message, {
      path: `${client.mailbox}/mailFolders/${encodeURIComponent(input.folderId)}/messages`,
      query: {
        $orderby: 'receivedDateTime desc',
        $filter: input.receivedAfter
          ? `receivedDateTime ge ${new Date(input.receivedAfter).toISOString()}`
          : undefined,
      },
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});
