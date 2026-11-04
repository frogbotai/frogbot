import { filesCollectionSlug } from 'frogbot/pieces';
import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { definePollingTrigger } from '../define.js';
import { saveAttachment, savedFile } from '../files.js';
import { message, messagePath } from '../mail.js';
import { pollFolder } from './poll.js';

const fileAttachment = z.object({
  id: z.string(),
  name: z.string().nullish(),
  contentType: z.string().nullish(),
  contentBytes: z.string().nullish(),
});

export const newAttachment = definePollingTrigger({
  slug: 'newAttachment',
  description:
    'Emit each new email with file attachments, after saving the attachments into FrogBot files.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object({
    folderId: identifier.default('inbox'),
  }),
  output: message.extend({ attachments: z.array(savedFile.extend({ attachmentId: z.string() })) }),
  async run({ client, input, cursor, req }) {
    const result = await pollFolder(client, {
      folderId: input.folderId,
      cursor,
      filter: 'hasAttachments eq true',
      signal: signal(req),
    });

    if (result.messages.length > 0) filesCollectionSlug(req, 'Microsoft Outlook');

    const events = [];

    for (const item of result.messages) {
      const found = await client.list(
        `${messagePath(client.mailbox, item.id)}/attachments`,
        fileAttachment,
        { signal: signal(req) },
      );

      const attachments = [];

      for (const attachment of found) {
        if (!attachment.contentBytes) continue;

        attachments.push({
          attachmentId: attachment.id,
          ...(await saveAttachment(
            req,
            { ...attachment, contentBytes: attachment.contentBytes },
            false,
          )),
        });
      }

      if (attachments.length > 0) events.push({ ...item, attachments });
    }

    return { events, cursor: result.cursor };
  },
});
