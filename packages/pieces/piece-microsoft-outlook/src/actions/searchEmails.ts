import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { message } from '../mail.js';

export const searchEmails = defineAction({
  slug: 'searchEmails',
  description:
    'Search emails, newest first, with Outlook search syntax such as from:dana@acme.com, subject:invoice or hasAttachments:true.',
  input: z.object({
    query: z.string().trim().min(1),
    folderId: identifier.optional().meta({ description: 'Search one folder instead of all mail.' }),
    limit: z.number().int().min(1).max(1000).default(25),
  }),
  output: z.array(message),
  idempotent: true,
  async run({ client, input, req }) {
    const folder = input.folderId
      ? `/mailFolders/${encodeURIComponent(input.folderId)}/messages`
      : '/messages';

    const result = await client.page(`${client.mailbox}${folder}`, message, {
      query: { $search: `"${input.query.replaceAll('"', '\\"')}"`, $top: input.limit },
      signal: signal(req),
    });

    return result.value.sort((a, b) =>
      (b.receivedDateTime ?? '').localeCompare(a.receivedDateTime ?? ''),
    );
  },
});
