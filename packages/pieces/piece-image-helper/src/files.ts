import type { FrogbotRequest } from 'frogbot';
import { lookup } from 'mime-types';
import { z } from 'zod';

export const imageFile = z.union([z.string(), z.number()]);

export const savedImage = z.object({
  id: z.union([z.string().min(1), z.number()]),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  url: z.string().min(1).optional(),
});

export type LoadedImage = {
  data: Buffer;
  name: string;
  extension?: string;
  mimeType: string;
};

function filesCollection(req: FrogbotRequest) {
  const collection = req.frogbot.config.files?.slug;

  if (!collection) {
    throw new Error('[frogbot] Image Helper requires the files collection to be configured.');
  }

  return collection;
}

export async function loadImage(req: FrogbotRequest, id: string | number): Promise<LoadedImage> {
  req.signal?.throwIfAborted();

  const doc = await req.frogbot.findByID({
    collection: filesCollection(req),
    id,
    depth: 0,
    req,
    overrideAccess: false,
  });

  if (typeof doc.url !== 'string') {
    throw new Error(`[frogbot] Image '${id}' is unavailable.`);
  }

  const config = await req.frogbot.config._internal.payloadConfig;
  const originURL = config.serverURL || req.url;

  if (!originURL) throw new Error('[frogbot] Image requests require a server URL.');

  const origin = new URL(originURL);
  const url = new URL(doc.url, origin);

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`[frogbot] Image '${id}' has an invalid URL.`);
  }

  const headers = new Headers();

  if (url.origin === origin.origin) {
    for (const name of ['authorization', 'cookie']) {
      const value = req.headers.get(name);

      if (value) headers.set(name, value);
    }
  }

  const timeout = AbortSignal.timeout(30_000);
  const response = await fetch(url, {
    headers,
    redirect: 'error',
    signal: req.signal ? AbortSignal.any([req.signal, timeout]) : timeout,
  });

  if (!response.ok) {
    throw new Error(`[frogbot] Image '${id}' is unavailable (${response.status}).`);
  }

  const name = typeof doc.filename === 'string' ? doc.filename : 'image';
  const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined;
  const mimeType =
    typeof doc.mimeType === 'string'
      ? doc.mimeType
      : (extension && lookup(extension)) || 'application/octet-stream';

  return {
    data: Buffer.from(await response.arrayBuffer()),
    name,
    extension,
    mimeType,
  };
}

export async function saveImage({
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
