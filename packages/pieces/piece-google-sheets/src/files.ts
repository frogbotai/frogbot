import type { FrogbotRequest } from 'frogbot';
import { z } from 'zod';

export const fileReference = z.object({
  fileId: z.union([z.string(), z.number()]),
  name: z.string().optional(),
});
export const savedFile = z.object({
  id: z.union([z.string(), z.number()]),
  filename: z.string(),
  url: z.string().optional(),
});

export async function loadFile({
  req,
  file,
}: {
  req: FrogbotRequest;
  file: z.output<typeof fileReference>;
}) {
  const collection = req.frogbot.config.files?.slug;
  if (!collection) {
    throw new Error('Google Sheets file uploads require a configured files collection.');
  }
  const doc = await req.frogbot.findByID({
    collection,
    id: file.fileId,
    depth: 0,
    req,
    overrideAccess: false,
  });
  if (typeof doc.url !== 'string') throw new Error(`File '${file.fileId}' is unavailable.`);
  const config = await req.frogbot.config._internal.payloadConfig;
  const base = new URL(config.serverURL || req.url!);
  const url = new URL(doc.url, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid file URL.');
  }
  const headers = new Headers();
  if (url.origin === base.origin) {
    for (const name of ['authorization', 'cookie']) {
      const value = req.headers.get(name);
      if (value) headers.set(name, value);
    }
  }
  const response = await fetch(url, {
    headers,
    signal: req.signal ?? undefined,
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`File '${file.fileId}' is unavailable (${response.status}).`);
  return {
    name: String(file.name ?? doc.filename ?? 'upload'),
    blob: new Blob([await response.arrayBuffer()], {
      type: String(doc.mimeType ?? 'application/octet-stream'),
    }),
  };
}

export async function saveFile({
  req,
  data,
  name,
  mimeType,
}: {
  req: FrogbotRequest;
  data: Buffer;
  name: string;
  mimeType: string;
}) {
  const collection = req.frogbot.config.files?.slug;
  if (!collection) {
    throw new Error('Google Sheets file downloads require a configured files collection.');
  }
  req.signal?.throwIfAborted();
  const doc = await req.frogbot.create({
    collection,
    data: {},
    req,
    overrideAccess: false,
    file: { data, name, mimetype: mimeType, size: data.length },
  });
  return { id: doc.id, filename: name, ...(typeof doc.url === 'string' ? { url: doc.url } : {}) };
}
