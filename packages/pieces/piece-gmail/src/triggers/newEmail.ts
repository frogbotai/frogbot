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
  maxResults: z.number().int().min(1).max(500).default(100),
  includeSpamTrash: z.boolean().default(false),
});

export const newEmail = {
  slug: 'newEmail',
  description: 'Emit newly received emails matching optional filters.',
  type: 'polling' as const,
  schedule: '*/5 * * * *',
  input: inputSchema,
  output: emailOutput,
  async run({
    client,
    input,
    cursor,
    req,
  }: PieceRunArgs<z.output<typeof inputSchema>, object, Gmail> & { cursor?: number }) {
    const now = Date.now();
    const list = await client.users.messages.list({
      userId: 'me',
      q: searchQuery(input, typeof cursor === 'number' ? cursor : undefined),
      labelIds: input.labelIds,
      maxResults: input.maxResults,
      includeSpamTrash: input.includeSpamTrash,
    });
    const events = await Promise.all(
      (list.data.messages ?? []).map(async ({ id }) =>
        id ? saveAttachments(client, req, await getOriginal(client, id)) : {},
      ),
    );
    return { events, cursor: now };
  },
};
