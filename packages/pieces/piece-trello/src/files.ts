import type { FrogbotRequest } from 'frogbot';

export async function loadAttachment(
  req: FrogbotRequest,
  value: { fileId: number | string; name?: string },
) {
  const collection = req.frogbot.config.files?.slug;

  if (!collection) {
    throw new Error('[frogbot] Trello attachments require the files collection to be configured.');
  }

  const doc = await req.frogbot.findByID({
    collection,
    id: value.fileId,
    depth: 0,
    req,
    overrideAccess: false,
  });

  const fileUrl = doc.url;

  if (typeof fileUrl !== 'string') {
    throw new Error(`[frogbot] File '${value.fileId}' is unavailable.`);
  }

  const config = await req.frogbot.config._internal.payloadConfig;
  const baseUrl = config.serverURL || req.url;

  if (typeof baseUrl !== 'string') {
    throw new Error(`[frogbot] File '${value.fileId}' is unavailable.`);
  }

  const url = new URL(fileUrl, baseUrl);
  const base = new URL(baseUrl);
  const headers = new Headers();

  if (url.origin !== base.origin) {
    throw new Error(`[frogbot] File '${value.fileId}' has an invalid URL.`);
  }

  for (const name of ['authorization', 'cookie']) {
    const header = req.headers.get(name);

    if (header) headers.set(name, header);
  }

  const response = await fetch(url, {
    headers,
    redirect: 'error',
    signal: req.signal ?? undefined,
  });

  if (!response.ok) {
    throw new Error(`[frogbot] File '${value.fileId}' is unavailable (${response.status}).`);
  }

  const filename = typeof doc.filename === 'string' ? doc.filename : undefined;
  const name = typeof doc.name === 'string' ? doc.name : undefined;
  const mimeType = typeof doc.mimeType === 'string' ? doc.mimeType : undefined;

  return {
    name: value.name ?? filename ?? name ?? 'attachment',
    type: mimeType ?? 'application/octet-stream',
    data: await response.blob(),
  };
}
