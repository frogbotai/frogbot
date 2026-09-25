import type { FrogBotRequest } from 'frogbot';
import { z } from 'zod';

import type { SavedFile } from './schemas.js';

export const fileReference = z.object({
  fileId: z.union([z.string().min(1), z.number()]),
  name: z.string().min(1).optional(),
});

function filesCollection(req: FrogBotRequest): string {
  const collection = req.frogbot.config?.files?.slug;

  if (!collection) throw new Error('[frogbot] Dropbox requires the files collection.');

  return collection;
}

export async function loadFile({
  req,
  file,
}: {
  req: FrogBotRequest;
  file: z.output<typeof fileReference>;
}): Promise<Buffer> {
  req.signal?.throwIfAborted();

  const doc = await req.frogbot.findByID({
    collection: filesCollection(req),
    id: file.fileId,
    depth: 0,
    req,
    overrideAccess: false,
  });

  if (typeof doc.url !== 'string') throw new Error('[frogbot] File is unavailable.');

  const config = await req.frogbot.config._internal.payloadConfig;
  const originValue = config.serverURL || req.url;

  if (!originValue) throw new Error('[frogbot] File requests require a server URL.');

  const origin = new URL(originValue);
  const url = new URL(doc.url, origin);

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('[frogbot] File URL is invalid.');
  }

  const headers = new Headers();

  if (url.origin === origin.origin) {
    for (const name of ['authorization', 'cookie']) {
      const value = req.headers.get(name);

      if (value) headers.set(name, value);
    }
  }

  const timeout = AbortSignal.timeout(30_000);
  const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
  const response = await fetch(url, { headers, redirect: 'error', signal });

  if (!response.ok) throw new Error(`[frogbot] File is unavailable (${response.status}).`);

  return Buffer.from(await response.arrayBuffer());
}

export async function saveFile({
  req,
  data,
  name,
  mimeType,
}: {
  req: FrogBotRequest;
  data: Buffer;
  name: string;
  mimeType: string;
}): Promise<SavedFile> {
  req.signal?.throwIfAborted();

  const doc = await req.frogbot.create({
    collection: filesCollection(req),
    data: {},
    file: { data, name, mimetype: mimeType, size: data.length },
    req,
    overrideAccess: false,
  });

  return {
    id: doc.id,
    name,
    mimeType,
    size: data.length,
    url: typeof doc.url === 'string' ? doc.url : undefined,
  };
}

export function responseBytes(value: unknown): Buffer {
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  throw new Error('[frogbot] Dropbox did not return file bytes.');
}
