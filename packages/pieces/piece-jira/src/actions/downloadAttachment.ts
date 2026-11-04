import { filesCollectionSlug } from 'frogbot/pieces';
import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { savedFile, saveFile } from '../files.js';
import { attachment } from '../records.js';

export const downloadAttachment = defineAction({
  slug: 'downloadAttachment',
  description: 'Save a Jira attachment into FrogBot files, as the caller.',
  input: z.object({
    attachmentId: identifier,
    name: z.string().optional().meta({ description: "The file name; defaults to Jira's." }),
  }),
  output: savedFile.extend({ attachmentId: z.string() }),
  idempotent: false,
  async run({ client, input, req }) {
    filesCollectionSlug(req, 'Jira');

    const id = encodeURIComponent(input.attachmentId);
    const meta = await client.request(attachment, {
      path: `/attachment/${id}`,
      signal: signal(req),
    });

    const content = await client.response({
      path: `/attachment/content/${id}`,
      query: { redirect: false },
      headers: { accept: '*/*' },
      signal: signal(req),
    });

    const data = Buffer.from(await content.arrayBuffer());

    return {
      attachmentId: meta.id,
      ...(await saveFile(req, {
        data,
        name: input.name ?? meta.filename,
        mimeType:
          meta.mimeType ??
          content.headers.get('content-type')?.split(';')[0]?.trim() ??
          'application/octet-stream',
      })),
    };
  },
});
