import type { FrogbotRequest } from 'frogbot';
import { lookup } from 'mime-types';
import { z } from 'zod';

export const fileId = z.union([z.string(), z.number()]);

export const savedFile = z.object({
  id: z.union([z.string(), z.number()]),
  filename: z.string(),
  url: z.string().optional(),
});

function resolveMimeType(value: unknown, filename: string) {
  if (typeof value === 'string' && value) return value;

  const detected = lookup(filename);

  return typeof detected === 'string' ? detected : 'application/octet-stream';
}

export async function loadFile({ req, id }: { req: FrogbotRequest; id: string | number }) {
  const collection = req.frogbot.config.files?.slug;

  if (!collection) throw new Error('File Helper requires a configured files collection.');

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

  const filename = String(doc.filename ?? 'file');
  const mimeType = resolveMimeType(doc.mimeType, filename);

  return { data: Buffer.from(await response.arrayBuffer()), filename, mimeType };
}

export async function saveFile({
  req,
  data,
  filename,
  mimeType,
}: {
  req: FrogbotRequest;
  data: Buffer;
  filename: string;
  mimeType?: string;
}) {
  const collection = req.frogbot.config.files?.slug;

  if (!collection) throw new Error('File Helper requires a configured files collection.');

  req.signal?.throwIfAborted();

  const resolvedMimeType = resolveMimeType(mimeType, filename);

  const doc = await req.frogbot.create({
    collection,
    data: {},
    req,
    overrideAccess: false,
    file: { data, name: filename, mimetype: resolvedMimeType, size: data.length },
  });

  return {
    id: doc.id,
    filename,
    ...(typeof doc.url === 'string' ? { url: doc.url } : {}),
  };
}
