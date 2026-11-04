import { findPieceFile, type FrogBotRequest } from 'frogbot/pieces';
import { z } from 'zod';

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

  const doc = await findPieceFile(req, 'Salesforce', {
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
    name: value.name ?? String(doc.filename ?? 'file'),
    mimeType: typeof doc.mimeType === 'string' ? doc.mimeType : 'application/octet-stream',
  };
}
