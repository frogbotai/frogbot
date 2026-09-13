import type { FrogbotRequest } from 'frogbot';
import { z } from 'zod';

export const fileId = z.union([z.string(), z.number()]);

export const savedFile = z.object({
  id: z.union([z.string(), z.number()]),
  filename: z.string(),
  url: z.string().optional(),
});

export async function loadFile(req: FrogbotRequest, id: z.output<typeof fileId>) {
  const collection = req.frogbot.config.files?.slug;

  if (!collection) throw new Error('PDF actions require a configured files collection.');

  const doc = await req.frogbot.findByID({
    collection,
    id,
    depth: 0,
    req,
    overrideAccess: false,
  });

  if (typeof doc.url !== 'string') throw new Error(`File '${id}' is unavailable.`);

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

  if (!response.ok) throw new Error(`File '${id}' is unavailable (${response.status}).`);

  return {
    data: Buffer.from(await response.arrayBuffer()),
    name: String(doc.filename ?? 'document'),
    mimeType: String(doc.mimeType ?? 'application/octet-stream'),
  };
}

export async function saveFile({
  req,
  data,
  name,
  mimeType,
}: {
  req: FrogbotRequest;
  data: Uint8Array;
  name: string;
  mimeType: string;
}) {
  const collection = req.frogbot.config.files?.slug;

  if (!collection) throw new Error('PDF actions require a configured files collection.');

  req.signal?.throwIfAborted();

  const buffer = Buffer.from(data);
  const doc = await req.frogbot.create({
    collection,
    data: {},
    req,
    overrideAccess: false,
    file: { data: buffer, name, mimetype: mimeType, size: buffer.length },
  });

  return {
    id: doc.id,
    filename: name,
    ...(typeof doc.url === 'string' ? { url: doc.url } : {}),
  };
}
