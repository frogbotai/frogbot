import type { FrogBotRequest } from 'frogbot';
import { createPieceFile, filesCollectionSlug } from 'frogbot/pieces';
import { z } from 'zod';

export const savedFile = z.object({
  id: z.union([z.string(), z.number()]),
  filename: z.string(),
  url: z.string().optional(),
});

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
}) {
  filesCollectionSlug(req, 'Google Sheets');

  req.signal?.throwIfAborted();
  const doc = await createPieceFile(req, 'Google Sheets', {
    req,
    overrideAccess: false,
    file: { data, name, mimetype: mimeType, size: data.length },
  });

  return { id: doc.id, filename: name, ...(typeof doc.url === 'string' ? { url: doc.url } : {}) };
}
