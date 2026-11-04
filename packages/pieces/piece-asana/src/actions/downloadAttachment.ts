import { createPieceFile, filesCollectionSlug } from 'frogbot/pieces';
import { z } from 'zod';

import { signal } from '../client.js';
import { gid } from '../config.js';
import { defineAction } from '../define.js';
import { attachment, fields } from '../records.js';

const downloadTimeout = 30_000;

const savedFile = z.object({
  fileId: z.union([z.string(), z.number()]),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string().nullable(),
});

export const downloadAttachment = defineAction({
  slug: 'downloadAttachment',
  description:
    'Save an Asana-hosted attachment into FrogBot files, as the caller. Files stored elsewhere (Google Drive, Dropbox, Box…) are not copied: file is null and link points at them.',
  input: z.object({ attachmentGid: gid('Attachment') }),
  output: z.object({
    attachment,
    file: savedFile.nullable(),
    link: z.string().nullable(),
  }),
  idempotent: false,
  async run({ client, input, req }) {
    filesCollectionSlug(req, 'Asana');

    const meta = await client.data(attachment, {
      path: `/attachments/${input.attachmentGid}`,
      query: { opt_fields: fields.attachment },
      signal: signal(req),
    });

    const link = meta.permanent_url ?? meta.view_url ?? null;

    if (meta.host !== 'asana' || !meta.download_url) return { attachment: meta, file: null, link };

    const url = new URL(meta.download_url);

    if (url.protocol !== 'https:') throw new Error('Asana returned a non-HTTPS download URL.');

    const response = await fetch(url, {
      signal: AbortSignal.any([
        AbortSignal.timeout(downloadTimeout),
        ...(req.signal ? [req.signal] : []),
      ]),
    });

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Asana attachment download failed (${response.status}).`);
    }

    const data = Buffer.from(await response.arrayBuffer());
    const name = meta.name ?? 'attachment';
    const mimeType =
      response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';

    req.signal?.throwIfAborted();

    const doc = await createPieceFile(req, 'Asana', {
      file: { data, mimetype: mimeType, name, size: data.length },
      req,
      overrideAccess: false,
    });

    return {
      attachment: meta,
      file: {
        fileId: doc.id,
        name,
        mimeType,
        size: data.length,
        url: typeof doc.url === 'string' ? doc.url : null,
      },
      link,
    };
  },
});
