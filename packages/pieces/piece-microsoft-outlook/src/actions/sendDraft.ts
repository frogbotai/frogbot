import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { messagePath } from '../mail.js';

export const sendDraft = defineAction({
  slug: 'sendDraft',
  description: 'Send a saved draft.',
  input: z.object({ messageId: identifier.meta({ description: 'The draft message id.' }) }),
  output: z.object({ messageId: z.string(), sent: z.literal(true) }),
  idempotent: false,
  async run({ client, input, req }) {
    await client.request(`${messagePath(client.mailbox, input.messageId)}/send`, z.unknown(), {
      method: 'POST',
      signal: signal(req),
    });

    return { messageId: input.messageId, sent: true as const };
  },
});
