import type { FrogBotRequest } from 'frogbot';
import { z } from 'zod';

export const discordAttachment = z.object({
  fileId: z.union([z.string(), z.number()]),
  name: z.string().optional(),
});

export async function loadDiscordAttachment(
  req: FrogBotRequest,
  attachment: z.output<typeof discordAttachment>,
) {
  const collection = req.frogbot.config.files?.slug;

  if (!collection) {
    throw new Error('[frogbot] Discord attachments require the files collection to be configured.');
  }

  const file = await req.frogbot.findByID({
    collection,
    id: attachment.fileId,
    depth: 0,
    req,
    overrideAccess: false,
  });

  if (typeof file.url !== 'string') {
    throw new Error(`[frogbot] File '${attachment.fileId}' is unavailable.`);
  }

  const config = await req.frogbot.config._internal.payloadConfig;
  const baseUrl = config.serverURL || req.url;

  if (!baseUrl) {
    throw new Error(`[frogbot] File '${attachment.fileId}' is unavailable.`);
  }

  const url = new URL(file.url, baseUrl);
  const base = new URL(baseUrl);
  const headers = new Headers();

  if (url.origin === base.origin) {
    for (const name of ['authorization', 'cookie']) {
      const value = req.headers.get(name);

      if (value) headers.set(name, value);
    }
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`[frogbot] File '${attachment.fileId}' has an unsafe URL.`);
  }

  const response = await fetch(url, {
    headers,
    redirect: 'error',
    signal: req.signal ?? undefined,
  });

  if (!response.ok) {
    throw new Error(`[frogbot] File '${attachment.fileId}' is unavailable (${response.status}).`);
  }

  const filename = typeof file.filename === 'string' ? file.filename : undefined;
  const fallbackName = typeof file.name === 'string' ? file.name : undefined;
  const name = attachment.name ?? filename ?? fallbackName ?? 'attachment';
  const type = typeof file.mimeType === 'string' ? file.mimeType : 'application/octet-stream';

  return {
    name,
    type,
    data: await response.arrayBuffer(),
  };
}
