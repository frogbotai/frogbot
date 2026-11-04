import type { FrogBotRequest } from 'frogbot/pieces';
import { z } from 'zod';

import { fileAttachment, fileInput } from './files.js';

const address = z.object({
  emailAddress: z.object({ name: z.string().nullish(), address: z.string().nullish() }).nullish(),
});

export const message = z
  .object({
    id: z.string(),
    subject: z.string().nullish(),
    from: address.nullish(),
    sender: address.nullish(),
    toRecipients: z.array(address).nullish(),
    ccRecipients: z.array(address).nullish(),
    bccRecipients: z.array(address).nullish(),
    replyTo: z.array(address).nullish(),
    receivedDateTime: z.string().nullish(),
    sentDateTime: z.string().nullish(),
    conversationId: z.string().nullish(),
    parentFolderId: z.string().nullish(),
    bodyPreview: z.string().nullish(),
    body: z.object({ contentType: z.string().nullish(), content: z.string().nullish() }).nullish(),
    categories: z.array(z.string()).nullish(),
    hasAttachments: z.boolean().nullish(),
    isRead: z.boolean().nullish(),
    isDraft: z.boolean().nullish(),
    webLink: z.string().nullish(),
  })
  .passthrough();

export type Message = z.output<typeof message>;

const emails = z.array(z.email());

export const recipients = {
  to: emails.min(1).meta({ description: 'Recipient addresses.' }),
  cc: emails.optional(),
  bcc: emails.optional(),
};

export const content = {
  body: z.string(),
  bodyType: z.enum(['text', 'html']).default('text'),
  attachments: z.array(fileInput).optional().meta({ description: 'FrogBot files to attach.' }),
};

export function addresses(list: string[] | undefined) {
  return list?.map((value) => ({ emailAddress: { address: value } }));
}

export async function attachments(
  req: FrogBotRequest,
  files: z.output<typeof fileInput>[] | undefined,
  overrideAccess: boolean,
) {
  if (!files?.length) return undefined;

  return Promise.all(files.map((file) => fileAttachment(req, file, overrideAccess)));
}

/** The Graph `message` body for a new email or draft. */
export async function newMessage(
  req: FrogBotRequest,
  input: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    bodyType: 'text' | 'html';
    attachments?: z.output<typeof fileInput>[];
  },
  overrideAccess: boolean,
) {
  return {
    subject: input.subject,
    body: { contentType: input.bodyType, content: input.body },
    toRecipients: addresses(input.to),
    ccRecipients: addresses(input.cc),
    bccRecipients: addresses(input.bcc),
    attachments: await attachments(req, input.attachments, overrideAccess),
  };
}

export function messagePath(mailbox: string, messageId: string) {
  return `${mailbox}/messages/${encodeURIComponent(messageId)}`;
}
