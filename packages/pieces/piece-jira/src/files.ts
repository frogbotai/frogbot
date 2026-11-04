import { createPieceFile, findPieceFile, type FrogBotRequest } from 'frogbot/pieces';
import { z } from 'zod';

const label = 'Jira';

export const fileInput = z.object({
  fileId: z.union([z.string(), z.number()]).meta({ description: 'A FrogBot files document id.' }),
  name: z.string().optional().meta({ description: 'The file name; defaults to the stored one.' }),
});

/** Reads a FrogBot file, forwarding the caller's credentials only to FrogBot's own origin. */
export async function loadFile(
  req: FrogBotRequest,
  value: z.output<typeof fileInput>,
  overrideAccess: boolean,
) {
  req.signal?.throwIfAborted();

  const doc = await findPieceFile(req, label, {
    id: value.fileId,
    depth: 0,
    req,
    overrideAccess,
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
    data: await response.arrayBuffer(),
    name: value.name ?? String(doc.filename ?? 'attachment'),
    mimeType: typeof doc.mimeType === 'string' ? doc.mimeType : 'application/octet-stream',
  };
}

export const savedFile = z.object({
  fileId: z.union([z.string(), z.number()]),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string().nullable(),
});

/** Saves bytes into the app's files collection as the caller. */
export async function saveFile(
  req: FrogBotRequest,
  file: { data: Buffer; name: string; mimeType: string },
  overrideAccess: boolean,
): Promise<z.output<typeof savedFile>> {
  req.signal?.throwIfAborted();

  const doc = await createPieceFile(req, label, {
    file: { data: file.data, mimetype: file.mimeType, name: file.name, size: file.data.length },
    req,
    overrideAccess,
  });

  return {
    fileId: doc.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.data.length,
    url: typeof doc.url === 'string' ? doc.url : null,
  };
}
