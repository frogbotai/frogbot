import { createPieceFile, filesCollectionSlug } from 'frogbot/pieces';
import { z } from 'zod';

import { signal } from '../client.js';
import { zendeskId } from '../config.js';
import { defineAction } from '../define.js';
import { attachment } from '../records.js';

const downloadTimeout = 30_000;
const maxHops = 5;

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
    'Save a ticket attachment into FrogBot files, as the caller. The Zendesk credential is sent only to the account’s own address, never to a redirect elsewhere.',
  input: z.object({ attachmentId: zendeskId('Attachment ID') }),
  output: z.object({ attachment, file: savedFile }),
  idempotent: false,
  async run({ client, input, req, overrideAccess }) {
    filesCollectionSlug(req, 'Zendesk');

    const meta = await client.data(z.object({ attachment }), {
      path: `/api/v2/attachments/${input.attachmentId}`,
      signal: signal(req),
    });

    const abort = AbortSignal.any([
      AbortSignal.timeout(downloadTimeout),
      ...(req.signal ? [req.signal] : []),
    ]);

    let url = new URL(meta.attachment.content_url);
    let response: Response | undefined;

    for (let hop = 0; hop <= maxHops; hop++) {
      if (url.protocol !== 'https:') {
        throw new Error('Zendesk returned a non-HTTPS attachment URL.');
      }

      response =
        url.origin === client.origin
          ? await client.send({ path: url.href, redirect: 'manual', signal: abort })
          : await fetch(url, { redirect: 'manual', signal: abort });

      const location = response.headers.get('location');

      if (response.status < 300 || response.status >= 400 || !location) break;

      await response.body?.cancel();
      url = new URL(location, url);
      response = undefined;
    }

    if (!response) throw new Error('Zendesk attachment download redirected too many times.');

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Zendesk attachment download failed (${response.status}).`);
    }

    const data = Buffer.from(await response.arrayBuffer());
    const name = meta.attachment.file_name;
    const mimeType =
      meta.attachment.content_type ||
      response.headers.get('content-type')?.split(';')[0]?.trim() ||
      'application/octet-stream';

    req.signal?.throwIfAborted();

    const doc = await createPieceFile(req, 'Zendesk', {
      file: { data, mimetype: mimeType, name, size: data.length },
      req,
      overrideAccess,
    });

    return {
      attachment: meta.attachment,
      file: {
        fileId: doc.id,
        name,
        mimeType,
        size: data.length,
        url: typeof doc.url === 'string' ? doc.url : null,
      },
    };
  },
});
