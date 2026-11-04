import { filesCollectionSlug } from 'frogbot/pieces';
import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { saveAttachment, savedFile } from '../files.js';
import { messagePath } from '../mail.js';

const attachment = z
  .object({
    '@odata.type': z.string().optional(),
    id: z.string(),
    name: z.string().nullish(),
    contentType: z.string().nullish(),
    contentBytes: z.string().nullish(),
  })
  .passthrough();

export const downloadAttachment = defineAction({
  slug: 'downloadAttachment',
  description:
    "Save an email's file attachments into FrogBot files: all of them, or one by id. Attached Outlook items are skipped.",
  input: z.object({ messageId: identifier, attachmentId: identifier.optional() }),
  output: z.array(savedFile.extend({ attachmentId: z.string() })),
  idempotent: false,
  async run({ client, input, req }) {
    filesCollectionSlug(req, 'Microsoft Outlook');

    const path = `${messagePath(client.mailbox, input.messageId)}/attachments`;
    const found = input.attachmentId
      ? [
          await client.request(`${path}/${encodeURIComponent(input.attachmentId)}`, attachment, {
            signal: signal(req),
          }),
        ]
      : await client.list(path, attachment, { signal: signal(req) });

    const saved = [];

    for (const item of found) {
      if (!item.contentBytes) continue;

      saved.push({
        attachmentId: item.id,
        ...(await saveAttachment(req, { ...item, contentBytes: item.contentBytes })),
      });
    }

    return saved;
  },
});
