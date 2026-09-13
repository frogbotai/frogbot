import type { FrogbotRequest } from 'frogbot';

export async function loadFile(req: FrogbotRequest, fileId: string | number) {
  const collection = req.frogbot.config.files?.slug;

  if (!collection) {
    throw new Error('[frogbot] Excel conversion requires the files collection to be configured.');
  }

  const file = await req.frogbot.findByID({
    collection,
    id: fileId,
    depth: 0,
    req,
    overrideAccess: false,
  });

  if (typeof file.url !== 'string') {
    throw new Error(`[frogbot] File '${fileId}' is unavailable.`);
  }

  const config = await req.frogbot.config._internal.payloadConfig;
  const base = new URL(config.serverURL || req.url!);
  const url = new URL(file.url, base);

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

  if (!response.ok) {
    throw new Error(`[frogbot] File '${fileId}' is unavailable (${response.status}).`);
  }

  return Buffer.from(await response.arrayBuffer());
}
