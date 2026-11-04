import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { addresses, messagePath } from '../mail.js';

export const forwardEmail = defineAction({
  slug: 'forwardEmail',
  description: 'Forward an email, with its attachments, and an optional comment above it.',
  input: z.object({
    messageId: identifier,
    to: z.array(z.email()).min(1),
    comment: z.string().optional(),
  }),
  output: z.object({ messageId: z.string(), forwarded: z.literal(true) }),
  idempotent: false,
  async run({ client, input, req }) {
    await client.request(`${messagePath(client.mailbox, input.messageId)}/forward`, z.unknown(), {
      method: 'POST',
      body: { comment: input.comment ?? '', toRecipients: addresses(input.to) },
      signal: signal(req),
    });

    return { messageId: input.messageId, forwarded: true as const };
  },
});
