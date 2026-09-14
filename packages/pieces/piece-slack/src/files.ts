import type { FrogbotRequest } from 'frogbot';
import { z } from 'zod';

export const slackFile = z.object({
  fileId: z.union([z.string(), z.number()]),
  name: z.string().optional(),
});

export async function loadSlackFile(req: FrogbotRequest, value: z.output<typeof slackFile>) {
  const collection = req.frogbot.config.files?.slug;

  if (!collection) throw new Error('[frogbot] Slack file uploads require the files collection.');

  const file = await req.frogbot.findByID({
    collection,
    id: value.fileId,
    depth: 0,
    req,
    overrideAccess: false,
  });

  const config = await req.frogbot.config._internal.payloadConfig;
  const serverUrl = config.serverURL || req.url;

  if (!serverUrl) throw new Error('[frogbot] Slack file uploads require a server URL.');

  const origin = new URL(serverUrl);
  const candidate = file.url;

  if (typeof candidate !== 'string') {
    throw new Error(`[frogbot] File '${value.fileId}' is unavailable.`);
  }

  const url = new URL(candidate, origin);

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`[frogbot] File '${value.fileId}' has an invalid URL.`);
  }

  const headers = new Headers();

  if (url.origin === origin.origin) {
    for (const name of ['authorization', 'cookie']) {
      const header = req.headers.get(name);

      if (header) headers.set(name, header);
    }
  }

  const response = await fetch(url, { headers, redirect: 'error', signal: req.signal });

  if (!response.ok) {
    throw new Error(`[frogbot] File '${value.fileId}' is unavailable (${response.status}).`);
  }

  return {
    data: await response.blob(),
    name:
      value.name ??
      (typeof file.filename === 'string' ? file.filename : `attachment-${value.fileId}`),
  };
}
