import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { Gmail } from '../client.js';
import { emailOutput, saveAttachments } from '../mail.js';

const inputSchema = z.object({
  messageId: z.string(),
  format: z.enum(['minimal', 'full', 'raw', 'metadata']).default('full'),
});

export const getEmail = {
  slug: 'getEmail',
  description: 'Get an email by ID.',
  input: inputSchema,
  output: emailOutput,
  idempotent: true,
  async run({ client, input, req }: PieceRunArgs<z.output<typeof inputSchema>, object, Gmail>) {
    const message = (
      await client.users.messages.get({ userId: 'me', id: input.messageId, format: input.format })
    ).data;
    return input.format === 'full' ? saveAttachments(client, req, message) : message;
  },
};
