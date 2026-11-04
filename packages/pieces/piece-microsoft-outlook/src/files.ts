import { createPieceFile, findPieceFile, type FrogBotRequest } from 'frogbot/pieces';
import { z } from 'zod';

const label = 'Microsoft Outlook';

export const fileInput = z.object({
  fileId: z.union([z.string(), z.number()]).meta({ description: 'A FrogBot files document id.' }),
  name: z.string().optional().meta({ description: 'The file name; defaults to the stored one.' }),
});

export const savedFile = z.object({
  fileId: z.union([z.string(), z.number()]),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string().nullable(),
});

/** Reads a FrogBot file as a Graph `fileAttachment`, forwarding the caller's credentials only to FrogBot's own origin. */
export async function fileAttachment(req: FrogBotRequest, value: z.output<typeof fileInput>) {
  const doc = await findPieceFile(req, label, {
    id: value.fileId,
    depth: 0,
    req,
    overrideAccess: false,
  });

  if (typeof doc.url !== 'string') throw new Error(`File '${value.fileId}' is unavailable.`);

  const config = await req.frogbot.config._internal.payloadConfig;
  const base = new URL(config.serverURL || req.url!);
  const url = new URL(doc.url, base);

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`File '${value.fileId}' has an invalid URL.`);
  }

  const headers = new Headers();

  if (url.origin === base.origin) {
    for (const name of ['authorization', 'cookie']) {
      const header = req.headers.get(name);

      if (header) headers.set(name, header);
    }
  }

  const response = await fetch(url, {
    headers,
    redirect: 'error',
    signal: req.signal ?? undefined,
  });

  if (!response.ok) throw new Error(`File '${value.fileId}' is unavailable (${response.status}).`);

  return {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: value.name ?? String(doc.filename ?? 'attachment'),
    contentType: typeof doc.mimeType === 'string' ? doc.mimeType : 'application/octet-stream',
    contentBytes: Buffer.from(await response.arrayBuffer()).toString('base64'),
  };
}

/** Saves one Graph `fileAttachment` into the app's files collection. */
export async function saveAttachment(
  req: FrogBotRequest,
  attachment: { name?: string | null; contentType?: string | null; contentBytes: string },
): Promise<z.output<typeof savedFile>> {
  req.signal?.throwIfAborted();

  const data = Buffer.from(attachment.contentBytes, 'base64');
  const name = attachment.name || 'attachment';
  const mimeType = attachment.contentType || 'application/octet-stream';
  const doc = await createPieceFile(req, label, {
    file: { data, mimetype: mimeType, name, size: data.length },
    req,
    overrideAccess: false,
  });

  return {
    fileId: doc.id,
    name,
    mimeType,
    size: data.length,
    url: typeof doc.url === 'string' ? doc.url : null,
  };
}
