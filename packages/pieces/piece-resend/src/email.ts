import { Buffer } from 'node:buffer';

import type { PieceDefinition } from 'frogbot/pieces';

import type { ResendClient } from './client.js';
import { address, addresses, compact, send } from './format.js';
import type { ResendTypes } from './piece-types.js';

function mapAttachment(attachment: {
  content?: unknown;
  encoding?: string;
  filename?: false | string;
}) {
  const content = attachment?.content;

  if (typeof content !== 'string' && !Buffer.isBuffer(content)) {
    throw new Error("Piece 'resend' email attachments must be a string or Buffer");
  }

  const buffer =
    typeof content === 'string'
      ? Buffer.from(content, attachment.encoding as BufferEncoding | undefined)
      : content;

  return { filename: attachment.filename, content: buffer.toString('base64') };
}

function mapBody(content: unknown) {
  return Buffer.isBuffer(content)
    ? content.toString()
    : typeof content === 'string'
      ? content
      : undefined;
}

export const resendEmail = {
  async send({ message, client, options }) {
    const from = address(message.from ?? options.from);

    if (!from) throw new Error('[frogbot] Resend email requires a from address.');

    return send(
      client,
      compact({
        from,
        to: addresses(message.to),
        cc: addresses(message.cc),
        bcc: addresses(message.bcc),
        reply_to: addresses(message.replyTo),
        subject: message.subject ?? '',
        html: mapBody(message.html),
        text: mapBody(message.text),
        attachments: message.attachments?.map(mapAttachment),
      }),
    );
  },
} satisfies NonNullable<PieceDefinition<ResendTypes, ResendClient>['email']>;
