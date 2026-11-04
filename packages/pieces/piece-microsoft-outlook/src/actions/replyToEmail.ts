import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { fileInput } from '../files.js';
import { addresses, attachments, message, messagePath } from '../mail.js';

export const replyToEmail = defineAction({
  slug: 'replyToEmail',
  description:
    'Reply to an email above the quoted thread, or save the reply as a draft. Reply all also includes the original recipients.',
  input: z.object({
    messageId: identifier,
    body: z.string().meta({ description: 'The reply text, placed above the quoted thread.' }),
    replyAll: z.boolean().default(false),
    cc: z.array(z.email()).optional(),
    bcc: z.array(z.email()).optional(),
    attachments: z.array(fileInput).optional(),
    draft: z.boolean().default(false).meta({ description: 'Save the reply as a draft.' }),
  }),
  output: z.object({ draft: message, sent: z.boolean() }),
  idempotent: false,
  async run({ client, input, req }) {
    const path = messagePath(client.mailbox, input.messageId);
    const reply = await client.request(
      `${path}/${input.replyAll ? 'createReplyAll' : 'createReply'}`,
      message,
      {
        method: 'POST',
        body: {
          comment: input.body,
          message: {
            ccRecipients: addresses(input.cc),
            bccRecipients: addresses(input.bcc),
            attachments: await attachments(req, input.attachments),
          },
        },
        signal: signal(req),
      },
    );

    if (input.draft) return { draft: reply, sent: false };

    await client.request(`${messagePath(client.mailbox, reply.id)}/send`, z.unknown(), {
      method: 'POST',
      signal: signal(req),
    });

    return { draft: reply, sent: true };
  },
});
