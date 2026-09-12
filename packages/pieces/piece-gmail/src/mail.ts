import type { FrogbotRequest } from 'frogbot';
import { type gmail_v1 } from 'googleapis';
import { z } from 'zod';

import type { Gmail } from './client.js';
import { attachment, loadFileAttachment } from './files.js';

export const recipients = {
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
};
export const messageBody = {
  body: z.string(),
  bodyType: z.enum(['plainText', 'html']).default('plainText'),
  attachments: z.array(attachment).optional(),
};
export const messageOutput = z
  .object({
    id: z.string().optional(),
    threadId: z.string().optional(),
    labelIds: z.array(z.string()).optional(),
  })
  .passthrough();
export const emailOutput = z
  .object({
    id: z.string().optional(),
    threadId: z.string().optional(),
    labelIds: z.array(z.string()).optional(),
    snippet: z.string().optional(),
    payload: z.unknown().optional(),
  })
  .passthrough();

function base64url(value: Buffer | string) {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
function encodedHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`;
}
export function splitAddresses(value?: string | null) {
  return (
    value
      ?.split(',')
      .map((address) => address.trim())
      .filter(Boolean) ?? []
  );
}
export function findHeader(message: gmail_v1.Schema$Message, name: string) {
  return message.payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())
    ?.value;
}
export async function getOriginal(client: Gmail, id: string) {
  return (await client.users.messages.get({ userId: 'me', id, format: 'full' })).data;
}

export async function saveAttachments(
  client: Gmail,
  req: FrogbotRequest,
  message: gmail_v1.Schema$Message,
) {
  const collection = req.frogbot.config.files?.slug;
  if (!collection || !message.id) return message;
  const parts: gmail_v1.Schema$MessagePart[] = [];
  const visit = (items?: gmail_v1.Schema$MessagePart[]) => {
    for (const part of items ?? []) {
      if (part.body?.attachmentId) parts.push(part);
      visit(part.parts);
    }
  };
  visit(message.payload?.parts);
  const attachments = await Promise.all(
    parts.map(async (part) => {
      const attachmentId = part.body?.attachmentId;
      if (!attachmentId) throw new Error('[frogbot] Gmail attachment is missing its ID.');
      const response = await client.users.messages.attachments.get({
        userId: 'me',
        messageId: message.id!,
        id: attachmentId,
      });
      const data = Buffer.from(
        (response.data.data ?? '').replaceAll('-', '+').replaceAll('_', '/'),
        'base64',
      );
      const name = part.filename || 'attachment';
      const doc = await req.frogbot.create({
        collection,
        data: {},
        file: {
          data,
          mimetype: part.mimeType ?? 'application/octet-stream',
          name,
          size: data.length,
        },
        req,
        overrideAccess: false,
      });
      return {
        id: doc.id,
        name,
        mimeType: part.mimeType ?? 'application/octet-stream',
        url: doc.url,
      };
    }),
  );
  return { ...message, attachments };
}

export async function createRawMessage({
  input,
  req,
  extraHeaders = [],
}: {
  input: {
    attachments?: z.output<typeof attachment>[];
    body: string;
    bodyType: 'plainText' | 'html';
    bcc?: string[];
    cc?: string[];
    from?: string;
    replyTo?: string[];
    senderName?: string;
    subject: string;
    to: string[];
  };
  req: FrogbotRequest;
  extraHeaders?: string[];
}) {
  const boundary = `frogbot-${crypto.randomUUID()}`;
  const files = await Promise.all(
    (input.attachments ?? []).map((value) => loadFileAttachment(req, value)),
  );
  const lines = [
    `To: ${input.to.join(', ')}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(', ')}`] : []),
    ...(input.bcc?.length ? [`Bcc: ${input.bcc.join(', ')}`] : []),
    ...(input.replyTo?.length ? [`Reply-To: ${input.replyTo.join(', ')}`] : []),
    ...(input.from
      ? [`From: ${input.senderName ? `${input.senderName} <${input.from}>` : input.from}`]
      : []),
    `Subject: ${encodedHeader(input.subject)}`,
    ...extraHeaders,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: ${input.bodyType === 'html' ? 'text/html' : 'text/plain'}; charset="UTF-8"`,
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(input.body).toString('base64'),
  ];
  for (const file of files)
    {lines.push(
      `--${boundary}`,
      `Content-Type: ${file.type}; name="${file.name}"`,
      `Content-Disposition: attachment; filename="${file.name}"`,
      'Content-Transfer-Encoding: base64',
      '',
      file.data.toString('base64'),
    );}
  lines.push(`--${boundary}--`);
  return base64url(lines.join('\r\n'));
}

export function searchQuery(
  input: { query?: string; from?: string; to?: string; subject?: string },
  after?: number,
) {
  return [
    input.query,
    input.from && `from:${input.from}`,
    input.to && `to:${input.to}`,
    input.subject && `subject:${input.subject}`,
    after && `after:${Math.floor(after / 1000)}`,
  ]
    .filter(Boolean)
    .join(' ');
}
