import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { Gmail } from '../client.js';
import { emailOutput, getOriginal, saveAttachments, searchQuery } from '../mail.js';

const inputSchema = z.object({
  query: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  labelIds: z.array(z.string()).optional(),
  maxResults: z.number().int().min(1).max(500).default(20),
  includeSpamTrash: z.boolean().default(false),
});

export const searchEmails = {
  slug: 'searchEmails',
  description: 'Search emails using Gmail search syntax and common filters.',
  input: inputSchema,
  output: z.array(emailOutput),
  idempotent: true,
  async run({ client, input, req }: PieceRunArgs<z.output<typeof inputSchema>, object, Gmail>) {
    const list = await client.users.messages.list({
      userId: 'me',
      q: searchQuery(input),
      labelIds: input.labelIds,
      maxResults: input.maxResults,
      includeSpamTrash: input.includeSpamTrash,
    });
    return Promise.all(
      (list.data.messages ?? []).map(async ({ id }) =>
        id ? saveAttachments(client, req, await getOriginal(client, id)) : {},
      ),
    );
  },
};
