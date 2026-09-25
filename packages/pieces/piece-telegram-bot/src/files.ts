import type { FrogBotRequest } from 'frogbot';
import { z } from 'zod';

export const telegramFile = z.object({
  fileId: z.union([z.string(), z.number()]),
  name: z.string().optional(),
});

const storedFile = z.object({
  url: z.string(),
  filename: z.string().optional(),
  name: z.string().optional(),
});

export async function loadTelegramFile(req: FrogBotRequest, value: z.output<typeof telegramFile>) {
  const collection = req.frogbot.config.files?.slug;

  if (!collection) {
    throw new Error('[frogbot] Telegram uploads require the files collection to be configured.');
  }

  const result = await req.frogbot.findByID({
    collection,
    id: value.fileId,
    depth: 0,
    req,
    overrideAccess: false,
  });
  const file = storedFile.safeParse(result);

  if (!file.success) throw new Error(`[frogbot] File '${value.fileId}' is unavailable.`);

  const config = await req.frogbot.config._internal.payloadConfig;
  const baseUrl = config.serverURL ?? req.url;

  if (!baseUrl) throw new Error(`[frogbot] File '${value.fileId}' has no resolvable URL.`);

  const url = new URL(file.data.url, baseUrl);
  const base = new URL(baseUrl);
  const headers = new Headers();

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`[frogbot] File '${value.fileId}' has an unsafe URL.`);
  }

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

  if (!response.ok) {
    throw new Error(`[frogbot] File '${value.fileId}' is unavailable (${response.status}).`);
  }

  return {
    data: await response.blob(),
    name: value.name ?? file.data.filename ?? file.data.name ?? 'upload',
  };
}
