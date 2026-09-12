import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { Gmail } from '../client.js';
import { createRawMessage, messageBody, messageOutput, recipients } from '../mail.js';

const inputSchema = z.object({
  ...recipients,
  subject: z.string(),
  ...messageBody,
  replyTo: z.array(z.string().email()).optional(),
  senderName: z.string().optional(),
  from: z.string().email().optional(),
  inReplyTo: z.string().optional(),
  draft: z.boolean().default(false),
});

export const send = {
  slug: 'send',
  description: 'Send an email or save it as a draft.',
  input: inputSchema,
  output: messageOutput,
  idempotent: false,
  async run({ client, input, req }: PieceRunArgs<z.output<typeof inputSchema>, object, Gmail>) {
    let threadId: string | undefined;
    const extraHeaders: string[] = [];
    if (input.inReplyTo) {
      extraHeaders.push(`References: ${input.inReplyTo}`, `In-Reply-To: ${input.inReplyTo}`);
      threadId =
        (await client.users.messages.list({ userId: 'me', q: `Rfc822msgid:${input.inReplyTo}` }))
          .data.messages?.[0]?.threadId ?? undefined;
    }
    const message = { threadId, raw: await createRawMessage({ input, req, extraHeaders }) };
    return input.draft
      ? ((await client.users.drafts.create({ userId: 'me', requestBody: { message } })).data
          .message ?? {})
      : (await client.users.messages.send({ userId: 'me', requestBody: message })).data;
  },
};
