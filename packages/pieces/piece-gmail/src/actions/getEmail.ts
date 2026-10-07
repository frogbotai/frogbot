import { z } from 'zod';

import { defineAction } from '../define.js';
import { emailOutput, saveAttachments } from '../mail.js';

const inputSchema = z.object({
  messageId: z.string(),
  format: z.enum(['minimal', 'full', 'raw', 'metadata']).default('full'),
});

export const getEmail = defineAction({
  slug: 'getEmail',
  description: 'Get an email by ID.',
  input: inputSchema,
  output: emailOutput,
  idempotent: true,
  async run({ client, input, req }) {
    const message = (
      await client.users.messages.get({ userId: 'me', id: input.messageId, format: input.format })
    ).data;

    const email = input.format === 'full' ? await saveAttachments(client, req, message) : message;

    return email as z.output<typeof emailOutput>;
  },
});
