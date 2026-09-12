import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { Gmail } from '../client.js';
import {
  createRawMessage,
  findHeader,
  getOriginal,
  messageBody,
  messageOutput,
  splitAddresses,
} from '../mail.js';

const inputSchema = z.object({
  messageId: z.string(),
  replyType: z.enum(['reply', 'replyAll']).default('reply'),
  ...messageBody,
});

async function replyMessage({
  client,
  input,
  req,
  draft,
}: PieceRunArgs<z.output<typeof inputSchema>, object, Gmail> & { draft: boolean }) {
  const original = await getOriginal(client, input.messageId);
  const messageId = findHeader(original, 'Message-ID') ?? '';
  const subject = findHeader(original, 'Subject')?.replace(/^Re:\s*/i, '') ?? '';
  const to = (
    input.replyType === 'replyAll'
      ? [findHeader(original, 'From'), ...splitAddresses(findHeader(original, 'To'))].filter(
          Boolean,
        )
      : [findHeader(original, 'From')].filter(Boolean)
  ) as string[];
  const cc =
    input.replyType === 'replyAll' ? splitAddresses(findHeader(original, 'Cc')) : undefined;
  const message = {
    threadId: original.threadId ?? undefined,
    raw: await createRawMessage({
      input: { ...input, to, cc, subject: `Re: ${subject}` },
      req,
      extraHeaders: [`In-Reply-To: ${messageId}`, `References: ${messageId}`],
    }),
  };
  return draft
    ? ((await client.users.drafts.create({ userId: 'me', requestBody: { message } })).data
        .message ?? {})
    : (await client.users.messages.send({ userId: 'me', requestBody: message })).data;
}

export const replyToEmail = {
  slug: 'replyToEmail',
  description: 'Reply to an existing email.',
  input: inputSchema,
  output: messageOutput,
  idempotent: false,
  run: (args: PieceRunArgs<z.output<typeof inputSchema>, object, Gmail>) =>
    replyMessage({ ...args, draft: false }),
};
export const createDraftReply = {
  slug: 'createDraftReply',
  description: 'Create a draft reply to an existing email.',
  input: inputSchema,
  output: messageOutput,
  idempotent: false,
  run: (args: PieceRunArgs<z.output<typeof inputSchema>, object, Gmail>) =>
    replyMessage({ ...args, draft: true }),
};
