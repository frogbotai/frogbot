import path from 'node:path';

import type { UIMessage } from 'ai';
import type { UploadConfig } from 'payload';
import { getFileByPath } from 'payload';

import { AgentServiceError } from '../agents/service.js';
import type { FrogbotRequest } from '../types/request.js';

type FileDocument = {
  filename?: string;
  mimeType?: string;
  url?: string;
};

type FileReferencePart = {
  type: 'file-reference';
  id: string | number;
  filename?: string;
  mediaType?: string;
};

export async function resolveChatAttachments({ req, messages }: { req: FrogbotRequest; messages: UIMessage[] }): Promise<UIMessage[]> {
  return Promise.all(messages.map(async (message) => ({ ...message, parts: await Promise.all(message.parts.map((part) => resolvePart({ req, part }))) })));
}

async function resolvePart({ req, part }: { req: FrogbotRequest; part: unknown }): Promise<UIMessage['parts'][number]> {
    if (!isFileReference(part)) return part as UIMessage['parts'][number];
    const doc = await findFile({ req, id: part.id });
    const filename = doc.filename;
    const mediaType = doc.mimeType;
    if (!filename || !mediaType) throw new AgentServiceError(`File '${part.id}' is unavailable`, 404);
    const data = await readFile({ req, doc, filename });
    return { type: 'file' as const, filename, mediaType, url: `data:${mediaType};base64,${data.toString('base64')}` };
}

function isFileReference(part: unknown): part is FileReferencePart {
  return typeof part === 'object' && part !== null && 'type' in part && part.type === 'file-reference' && 'id' in part && (typeof part.id === 'string' || typeof part.id === 'number');
}

async function findFile({ req, id }: { req: FrogbotRequest; id: string | number }): Promise<FileDocument> {
  try {
    return await req.frogbot.findByID({
      collection: req.frogbot.config.files.slug,
      id,
      depth: 0,
      req,
      overrideAccess: false,
    }) as FileDocument;
  } catch (error) {
    const status = getStatus(error);
    throw new AgentServiceError(status === 403 ? `Access denied for file '${id}'` : `File '${id}' not found`, status === 403 ? 403 : 404);
  }
}

async function readFile({ req, doc, filename }: { req: FrogbotRequest; doc: FileDocument; filename: string }): Promise<Buffer> {
  const config = await req.frogbot.config._internal.payloadConfig;
  const collection = config.collections.find(({ slug }) => slug === req.frogbot.config.files.slug);
  const upload: UploadConfig = collection && typeof collection.upload === 'object' ? collection.upload : {};
  if (!upload.disableLocalStorage) {
    const staticDir = path.resolve(upload.staticDir || collection?.slug || '');
    const filePath = path.resolve(staticDir, filename);
    if (filePath === staticDir || filePath.startsWith(`${staticDir}${path.sep}`)) {
      const file = await getFileByPath(filePath).catch(() => undefined);
      if (file?.data) return file.data;
    }
  }
  if (!doc.url) throw new AgentServiceError(`File '${filename}' is unavailable`, 404);
  const url = new URL(doc.url, config.serverURL || req.url);
  const headers = new Headers();
  for (const name of ['authorization', 'cookie']) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = await fetch(url, { headers, signal: req.signal ?? undefined });
  if (!response.ok) throw new AgentServiceError(`File '${filename}' is unavailable`, response.status === 403 ? 403 : 404);
  return Buffer.from(await response.arrayBuffer());
}

function getStatus(error: unknown): number {
  if (!error || typeof error !== 'object') return 404;
  const status = 'status' in error ? error.status : 'statusCode' in error ? error.statusCode : undefined;
  return status === 403 ? 403 : 404;
}
