import type { FrogbotRequest } from 'frogbot';
import { z } from 'zod';

export const attachment = z.object({
  fileId: z.union([z.string(), z.number()]),
  name: z.string().optional(),
});

export async function loadFileAttachment(req: FrogbotRequest, value: z.output<typeof attachment>) {
  const collection = req.frogbot.config.files?.slug;
  if (!collection)
    {throw new Error('[frogbot] Gmail attachments require the files collection to be configured.');}
  const doc = await req.frogbot.findByID({
    collection,
    id: value.fileId,
    depth: 0,
    req,
    overrideAccess: false,
  });
  if (typeof doc.url !== 'string')
    {throw new Error(`[frogbot] File '${value.fileId}' is unavailable.`);}
  const config = await req.frogbot.config._internal.payloadConfig;
  const headers = new Headers();
  for (const name of ['authorization', 'cookie']) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = await fetch(new URL(doc.url, config.serverURL || req.url), {
    headers,
    signal: req.signal ?? undefined,
  });
  if (!response.ok)
    {throw new Error(`[frogbot] File '${value.fileId}' is unavailable (${response.status}).`);}
  return {
    name: value.name ?? doc.filename ?? doc.name ?? 'attachment',
    type: doc.mimeType ?? 'application/octet-stream',
    data: Buffer.from(await response.arrayBuffer()),
  };
}
