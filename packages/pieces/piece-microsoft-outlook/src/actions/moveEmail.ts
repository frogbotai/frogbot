import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { message, messagePath } from '../mail.js';

export const moveEmail = defineAction({
  slug: 'moveEmail',
  description: 'Move an email to another folder. The moved email gets a new id.',
  input: z.object({
    messageId: identifier,
    folderId: identifier.meta({
      description: 'A folder id, or a well-known name such as inbox, archive or deleteditems.',
    }),
  }),
  output: message,
  idempotent: false,
  async run({ client, input, req }) {
    return client.request(`${messagePath(client.mailbox, input.messageId)}/move`, message, {
      method: 'POST',
      body: { destinationId: input.folderId },
      signal: signal(req),
    });
  },
});
