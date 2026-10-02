import path from 'node:path';

import type { ModelMessage, TextPart, ToolSet, UIMessage } from 'ai';
import { convertToModelMessages } from 'ai';
import type { PayloadRequest, UploadConfig } from 'payload';
import { getFileByPath } from 'payload';

import { AgentServiceError } from '../agents/service.js';
import { resolveModelInputs } from '../ai/modelInputs.js';
import type { FrogBotRequest } from '../types/request.js';
import type { AttachmentKind } from './attachmentParts.js';
import {
  attachmentKind,
  decodeText,
  kindIsCertain,
  sentMediaType,
  textAttachment,
  unavailableMarker,
  unreadableFileMarker,
} from './attachmentParts.js';
import { type OfficeKind, officeKind, officeText } from './office/officeText.js';
import { OfficeFileError } from './office/zipGuard.js';
import type { AttachmentSlot } from './toModelInput.js';
import { boundMedia, markRepeated } from './toModelInput.js';

export type AgentModelMessagesProps = {
  req: FrogBotRequest;
  messages: UIMessage[];
  chatId?: string | number;
  model: string;
  tools: ToolSet;
  onUnavailable: 'throw' | 'marker';
};

type AssetDocument = {
  id: string | number;
  filename?: string;
  mimeType?: string;
  filesize?: number;
  sha256?: string | null;
  text?: string | null;
  prefix?: string;
  chat?: string | number | { id: string | number } | null;
};

type FileReferencePart = {
  type: 'file-reference';
  id: string | number;
  filename?: string;
  mediaType?: string;
  origin?: 'paste';
};

type UIPart = UIMessage['parts'][number];

type LoadedAsset = AssetDocument & { filename: string; mimeType: string };

type Lookup = { doc: LoadedAsset } | { error: Error };

type Reference =
  | { part: FileReferencePart; error: Error }
  | { part: FileReferencePart; doc: LoadedAsset; name: string; slot: AttachmentSlot };

type AssetsCollection = {
  slug: string;
  upload: UploadConfig;
};

type FileReader = (doc: LoadedAsset) => Promise<Uint8Array>;

type ResolvedPart = {
  part: UIPart;
  writeBack?: { id: string | number; text: string };
};

export async function toAgentModelMessages({
  req,
  messages,
  chatId,
  model,
  tools,
  onUnavailable,
}: AgentModelMessagesProps): Promise<ModelMessage[]> {
  const parts = messages.flatMap((message) =>
    message.parts.flatMap((part) => (isFileReference(part) ? [part] : [])),
  );

  const resolved =
    parts.length === 0
      ? new Map<UIPart, UIPart>()
      : await resolveReferences({ req, parts, chatId, model, onUnavailable });

  const uiMessages = messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => resolved.get(part) ?? part),
  }));

  return convertToModelMessages(uiMessages, { tools, convertDataPart });
}

function convertDataPart(part: { type: string; data: unknown }): TextPart | undefined {
  if (part.type !== 'data-paste') return undefined;

  const data = part.data as { text?: unknown } | null;

  if (typeof data?.text !== 'string') return undefined;

  return { type: 'text', text: textAttachment({ origin: 'paste', text: data.text }) };
}

async function resolveReferences({
  req,
  parts,
  chatId,
  model,
  onUnavailable,
}: {
  req: FrogBotRequest;
  parts: FileReferencePart[];
  chatId?: string | number;
  model: string;
  onUnavailable: 'throw' | 'marker';
}): Promise<Map<UIPart, UIPart>> {
  const collection = await assetsCollection(req);
  const lookups = new Map<string | number, Lookup>();
  const references: Reference[] = [];

  for (const part of parts) {
    if (!lookups.has(part.id)) {
      lookups.set(part.id, await findAsset({ req, part, collection, chatId }));
    }

    const lookup = lookups.get(part.id)!;

    if ('error' in lookup) {
      references.push({ part, error: lookup.error });

      continue;
    }

    const name = part.filename || lookup.doc.filename;

    references.push({
      part,
      doc: lookup.doc,
      name,
      slot: assetSlot({ doc: lookup.doc, filename: name }),
    });
  }

  if (onUnavailable === 'throw') {
    for (const reference of references) {
      if ('error' in reference) throw reference.error;
    }
  }

  const slots = references.flatMap((reference) => ('slot' in reference ? [reference.slot] : []));

  markRepeated(slots);
  boundMedia({ slots, ...resolveModelInputs({ config: req.frogbot.config.ai!, model }) });

  const read = fileReader({ req, collection });

  const resolved = await Promise.all(
    references.map((reference) => resolvePart({ reference, read, onUnavailable })),
  );

  const transactionID = await req.transactionID;

  for (const { writeBack } of resolved) {
    if (!writeBack) continue;

    try {
      await req.frogbot.update({
        collection: collection.slug,
        id: writeBack.id,
        data: { text: writeBack.text },
        depth: 0,
        req,
        overrideAccess: true,
      });
    } catch (error) {
      if (transactionID) throw error;

      req.frogbot.logger.warn(
        { err: error, id: writeBack.id },
        '[frogbot] Failed to store the text of a file',
      );
    }
  }

  return new Map(
    references.map((reference, index) => [
      reference.part as unknown as UIPart,
      resolved[index]!.part,
    ]),
  );
}

async function assetsCollection(req: FrogBotRequest): Promise<AssetsCollection> {
  const chat = req.frogbot.config.chat;

  if (!chat.enabled) {
    throw new AgentServiceError('Chat attachments require chat persistence', 400);
  }

  const config = await req.frogbot.config._internal.payloadConfig;
  const collection = config.collections.find((entry) => entry.slug === chat.assetsSlug);

  return {
    slug: chat.assetsSlug,
    upload: collection && typeof collection.upload === 'object' ? collection.upload : {},
  };
}

async function findAsset({
  req,
  part,
  collection,
  chatId,
}: {
  req: FrogBotRequest;
  part: FileReferencePart;
  collection: AssetsCollection;
  chatId?: string | number;
}): Promise<Lookup> {
  let doc: AssetDocument;

  try {
    doc = (await req.frogbot.findByID({
      collection: collection.slug,
      id: part.id,
      depth: 0,
      req,
      overrideAccess: false,
      showHiddenFields: true,
    })) as AssetDocument;
  } catch (error) {
    const denied = getStatus(error) === 403;

    return {
      error: new AgentServiceError(
        denied ? `Access denied for file '${part.id}'` : `File '${part.id}' not found`,
        denied ? 403 : 404,
      ),
    };
  }

  const { filename, mimeType } = doc;

  if (!filename || !mimeType) {
    return { error: new AgentServiceError(`File '${part.id}' is unavailable`, 404) };
  }

  if (chatId !== undefined && !doc.chat) {
    await req.frogbot.update({
      collection: collection.slug,
      id: doc.id,
      data: { chat: chatId },
      depth: 0,
      req,
      overrideAccess: true,
    });
  }

  return { doc: { ...doc, filename, mimeType } };
}

function certainKind(file: { mediaType: string; filename: string }): AttachmentKind | undefined {
  return kindIsCertain(file) ? attachmentKind(file) : undefined;
}

function assetSlot({ doc, filename }: { doc: LoadedAsset; filename: string }): AttachmentSlot {
  return {
    kind: certainKind({ mediaType: doc.mimeType, filename }),
    filename,
    size: typeof doc.filesize === 'number' ? Math.ceil(doc.filesize / 3) * 4 : undefined,
    hash: () => doc.sha256 || `asset:${doc.id}`,
  };
}

function textPart(text: string): ResolvedPart {
  return { part: { type: 'text', text } };
}

async function officePart({
  doc,
  bytes,
  kind,
  filename,
  origin,
}: {
  doc: LoadedAsset;
  bytes: Uint8Array;
  kind: OfficeKind;
  filename: string;
  origin?: 'paste';
}): Promise<ResolvedPart> {
  let text: string;

  try {
    text = await officeText({ bytes, filename: doc.filename, kind });
  } catch (error) {
    if (!(error instanceof OfficeFileError)) throw error;

    return textPart(unreadableFileMarker({ filename }));
  }

  return {
    ...textPart(textAttachment({ filename, origin, text })),
    writeBack: { id: doc.id, text },
  };
}

async function resolvePart({
  reference,
  read,
  onUnavailable,
}: {
  reference: Reference;
  read: FileReader;
  onUnavailable: 'throw' | 'marker';
}): Promise<ResolvedPart> {
  if ('error' in reference) {
    return textPart(unavailableMarker({ filename: reference.part.filename }));
  }

  const { part, doc, name: filename, slot } = reference;

  if (slot.replacement !== undefined) return textPart(slot.replacement);

  if (typeof doc.text === 'string') {
    return textPart(textAttachment({ filename, origin: part.origin, text: doc.text }));
  }

  let bytes: Uint8Array;

  try {
    bytes = await read(doc);
  } catch (error) {
    if (onUnavailable === 'throw') throw error;

    return textPart(unavailableMarker({ kind: slot.kind, filename }));
  }

  const office = officeKind({ mediaType: doc.mimeType, filename: doc.filename });

  if (office) return officePart({ doc, bytes, kind: office, filename, origin: part.origin });

  const kind = attachmentKind({
    mediaType: doc.mimeType,
    filename,
    head: slot.kind ? undefined : bytes,
  });

  if (kind === 'text') {
    return textPart(textAttachment({ filename, origin: part.origin, text: decodeText(bytes) }));
  }

  const mediaType = sentMediaType({ mediaType: doc.mimeType, filename }) ?? doc.mimeType;

  return {
    part: {
      type: 'file',
      filename,
      mediaType,
      url: `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}`,
    },
  };
}

function fileReader({
  req,
  collection,
}: {
  req: FrogBotRequest;
  collection: AssetsCollection;
}): FileReader {
  const reads = new Map<string | number, Promise<Uint8Array>>();
  let handlerReq: Promise<FrogBotRequest> | undefined;

  const readFile: FileReader = async (doc) => {
    const handlers = collection.upload.handlers ?? [];

    if (handlers.length > 0) {
      handlerReq ??= req.frogbot.createRequest({ user: req.user, context: req.context });

      const response = await handlerResponse({ handlers, req: await handlerReq, doc, collection });

      if (response) return responseBytes({ response, filename: doc.filename });
    }

    return localFile({ upload: collection.upload, slug: collection.slug, filename: doc.filename });
  };

  return (doc) => {
    if (!reads.has(doc.id)) reads.set(doc.id, readFile(doc));

    return reads.get(doc.id)!;
  };
}

async function handlerResponse({
  handlers,
  req,
  doc,
  collection,
}: {
  handlers: NonNullable<UploadConfig['handlers']>;
  req: FrogBotRequest;
  doc: LoadedAsset;
  collection: AssetsCollection;
}): Promise<Response | undefined> {
  const headers = new Headers();

  const params = {
    collection: collection.slug,
    filename: doc.filename,
    ...(typeof doc.prefix === 'string' ? { prefix: doc.prefix } : {}),
  };

  for (const handler of handlers) {
    const response = await handler(req as unknown as PayloadRequest, { doc, headers, params });

    if (response instanceof Response) return response;
  }

  return undefined;
}

async function responseBytes({
  response,
  filename,
}: {
  response: Response;
  filename: string;
}): Promise<Uint8Array> {
  const location = response.headers.get('location');
  const redirected = response.status >= 300 && response.status < 400 && location;
  const file = redirected ? await fetch(location) : response;

  if (!file.ok) throw new AgentServiceError(`File '${filename}' is unavailable`, 404);

  return new Uint8Array(await file.arrayBuffer());
}

async function localFile({
  upload,
  slug,
  filename,
}: {
  upload: UploadConfig;
  slug: string;
  filename: string;
}): Promise<Uint8Array> {
  const staticDir = path.resolve(upload.staticDir || slug);
  const filePath = path.resolve(staticDir, filename);

  if (filePath.startsWith(`${staticDir}${path.sep}`)) {
    const file = await getFileByPath(filePath).catch(() => undefined);

    if (file?.data) return file.data;
  }

  throw new AgentServiceError(`File '${filename}' is unavailable`, 404);
}

function isFileReference(part: unknown): part is FileReferencePart {
  return (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    part.type === 'file-reference' &&
    'id' in part &&
    (typeof part.id === 'string' || typeof part.id === 'number')
  );
}

function getStatus(error: unknown): number {
  if (!error || typeof error !== 'object') return 404;

  const status =
    'status' in error ? error.status : 'statusCode' in error ? error.statusCode : undefined;

  return status === 403 ? 403 : 404;
}
