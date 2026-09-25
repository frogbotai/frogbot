import type { FrogBotRequest } from 'frogbot';
import { z } from 'zod';

import { type GoogleDriveClient, requestOptions } from './client.js';
import { type DriveFile, fileOutput, folderMimeType, type SavedFile } from './schemas.js';

export const fileReference = z.object({
  fileId: z.union([z.string().min(1), z.number()]),
  name: z.string().min(1).optional(),
});

type FileContent = { data: Buffer; name: string; mimeType: string };

function filesCollection(req: FrogBotRequest): string {
  const collection = req.frogbot.config?.files?.slug;
  if (!collection) throw new Error('[frogbot] Google Drive requires the files collection.');
  return collection;
}

export async function loadFile({
  req,
  file,
  signal = req.signal ?? undefined,
}: {
  req: FrogBotRequest;
  file: z.output<typeof fileReference>;
  signal?: AbortSignal;
}): Promise<FileContent> {
  signal?.throwIfAborted();
  const doc = await req.frogbot.findByID({
    collection: filesCollection(req),
    id: file.fileId,
    depth: 0,
    req,
    overrideAccess: false,
  });
  if (typeof doc.url !== 'string') throw new Error('[frogbot] File is unavailable.');
  const config = await req.frogbot.config._internal.payloadConfig;
  const originURL = config.serverURL || req.url;
  if (!originURL) throw new Error('[frogbot] File requests require a server URL.');
  const origin = new URL(originURL);
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
  const response = await fetch(url, {
    headers,
    redirect: 'error',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error(`[frogbot] File is unavailable (${response.status}).`);
  return {
    data: Buffer.from(await response.arrayBuffer()),
    name:
      file.name ??
      (typeof doc.filename === 'string'
        ? doc.filename
        : typeof doc.name === 'string'
          ? doc.name
          : 'file'),
    mimeType: typeof doc.mimeType === 'string' ? doc.mimeType : 'application/octet-stream',
  };
}

export async function saveFile({
  req,
  data,
  name,
  mimeType,
}: FileContent & { req: FrogBotRequest }): Promise<SavedFile> {
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

export function contentBytes(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new Error('[frogbot] Google Drive did not return file bytes.');
}

const exportFormats: Record<string, { mimeType: string; extension: string }> = {
  'application/vnd.google-apps.document': {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: '.docx',
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: '.xlsx',
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extension: '.pptx',
  },
};

export async function downloadDriveFile({
  client,
  req,
  fileId,
  name,
  includeSharedDrives,
  metadata,
}: {
  client: GoogleDriveClient;
  req: FrogBotRequest;
  fileId: string;
  name?: string;
  includeSharedDrives: boolean;
  metadata?: DriveFile;
}): Promise<SavedFile> {
  filesCollection(req);
  const file =
    metadata ??
    fileOutput.parse(
      (
        await client.files.get(
          {
            fileId,
            fields: 'id,name,mimeType',
            supportsAllDrives: includeSharedDrives,
          },
          requestOptions(req),
        )
      ).data,
    );
  if (file.mimeType === folderMimeType) throw new Error('[frogbot] Folders cannot be downloaded.');
  const format = file.mimeType ? exportFormats[file.mimeType] : undefined;
  const response = format
    ? await client.files.export(
        { fileId, mimeType: format.mimeType },
        {
          ...requestOptions(req),
          responseType: 'arraybuffer',
        },
      )
    : await client.files.get(
        { fileId, alt: 'media', supportsAllDrives: includeSharedDrives },
        {
          ...requestOptions(req),
          responseType: 'arraybuffer',
        },
      );
  let filename = name ?? file.name ?? fileId;
  if (format && !filename.toLowerCase().endsWith(format.extension)) filename += format.extension;
  return saveFile({
    req,
    data: contentBytes(response.data),
    name: filename,
    mimeType: format?.mimeType ?? file.mimeType ?? 'application/octet-stream',
  });
}
