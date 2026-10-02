import { createHash } from 'node:crypto';

import type { ModelMessage } from 'ai';

import type { ModelModality } from '../ai/types.js';
import type { AttachmentKind, AttachmentMediaKind } from './attachmentParts.js';
import {
  attachmentKind,
  decodeText,
  HEAD_BYTES,
  isMediaKind,
  kindIsCertain,
  removedMarker,
  repeatedMarker,
  textAttachment,
  unreadableMarker,
  unsupportedMarker,
} from './attachmentParts.js';

export type AttachmentHashes = Map<string | Uint8Array | ArrayBuffer, string>;

export const IMAGE_COUNT_LIMITS: Partial<Record<string, number>> = { bedrock: 20 };

const SIZE_TRIGGER = 25 * 1024 * 1024;
const SIZE_TARGET = 15 * 1024 * 1024;
const HEAD_BASE64 = Math.ceil(HEAD_BYTES / 3) * 4;

type InlineData = {
  key: string | Uint8Array | ArrayBuffer;
  size: number;
  mediaType?: string;
  head: () => Uint8Array;
  bytes: () => Uint8Array;
};

type Attachment = {
  mediaType: string;
  filename?: string;
  data?: InlineData;
};

export type AttachmentSlot = {
  kind?: AttachmentKind;
  filename?: string;
  size?: number;
  hash?: () => string;
  replacement?: string;
};

type Slot = AttachmentSlot & { kind: AttachmentKind; data?: InlineData };

type Part = { type: string } & Record<string, unknown>;

type Visit = (attachment: Attachment) => string | undefined;

function base64Data({
  base64,
  key,
  mediaType,
}: {
  base64: string;
  key: string;
  mediaType?: string;
}): InlineData {
  return {
    key,
    size: base64.length,
    mediaType,
    head: () => Buffer.from(base64.slice(0, HEAD_BASE64), 'base64').subarray(0, HEAD_BYTES),
    bytes: () => Buffer.from(base64, 'base64'),
  };
}

function bytesData({
  bytes,
  key,
}: {
  bytes: () => Uint8Array;
  key: InlineData['key'];
}): InlineData {
  const size = key instanceof ArrayBuffer ? key.byteLength : bytes().byteLength;

  return {
    key,
    size: Math.ceil(size / 3) * 4,
    head: () => bytes().subarray(0, HEAD_BYTES),
    bytes,
  };
}

function urlData(url: string): InlineData | undefined {
  if (!url.startsWith('data:')) return undefined;

  const comma = url.indexOf(',');
  const mediaType = url.slice('data:'.length, comma).split(';', 1)[0];

  return base64Data({ base64: url.slice(comma + 1), key: url, mediaType });
}

function stringData(value: string): InlineData | undefined {
  if (value.startsWith('data:')) return urlData(value);

  try {
    new URL(value);

    return undefined;
  } catch {
    return base64Data({ base64: value, key: value });
  }
}

function inlineData(value: unknown): InlineData | undefined {
  if (value instanceof URL) return urlData(value.href);

  if (typeof value === 'string') return stringData(value);

  if (value instanceof Uint8Array) return bytesData({ bytes: () => value, key: value });

  if (value instanceof ArrayBuffer) {
    return bytesData({ bytes: () => new Uint8Array(value), key: value });
  }

  if (typeof value !== 'object' || value === null || !('type' in value)) return undefined;

  if (value.type === 'data' && 'data' in value) return inlineData(value.data);

  if (value.type === 'url' && 'url' in value) return inlineData(value.url);

  if (value.type === 'text' && 'text' in value && typeof value.text === 'string') {
    const text = value.text;

    return bytesData({ bytes: () => new TextEncoder().encode(text), key: `text:${text}` });
  }

  return undefined;
}

function attachment({
  mediaType,
  filename,
  data,
}: {
  mediaType: unknown;
  filename?: unknown;
  data?: InlineData;
}): Attachment | undefined {
  const type = typeof mediaType === 'string' && mediaType ? mediaType : data?.mediaType;

  if (!type) return undefined;

  return { mediaType: type, filename: typeof filename === 'string' ? filename : undefined, data };
}

function userAttachment(part: Part): Attachment | undefined {
  if (part.type === 'image') {
    const data = inlineData(part.image);

    return attachment({ mediaType: part.mediaType ?? data?.mediaType ?? 'image', data });
  }

  if (part.type !== 'file') return undefined;

  return attachment({
    mediaType: part.mediaType,
    filename: part.filename,
    data: inlineData(part.data),
  });
}

function toolAttachment(item: Part): Attachment | undefined {
  switch (item.type) {
    case 'file':
      return attachment({
        mediaType: item.mediaType,
        filename: item.filename,
        data: inlineData(item.data),
      });
    case 'file-data':
    case 'image-data':
      return attachment({
        mediaType: item.mediaType,
        filename: item.filename,
        data: typeof item.data === 'string' ? stringData(item.data) : undefined,
      });
    case 'file-url':
      return attachment({ mediaType: item.mediaType });
    case 'image-url':
    case 'image-file-id':
    case 'image-file-reference':
      return attachment({ mediaType: 'image' });
    default:
      return undefined;
  }
}

function mapList<T>(list: T[], map: (item: T) => T): T[] {
  let changed = false;

  const mapped = list.map((item) => {
    const next = map(item);

    if (next !== item) changed = true;

    return next;
  });

  return changed ? mapped : list;
}

function replaced({
  part,
  found,
  visit,
}: {
  part: Part;
  found: Attachment | undefined;
  visit: Visit;
}): Part {
  if (!found) return part;

  const text = visit(found);

  return text === undefined ? part : { type: 'text', text };
}

function mapPart({ part, role, visit }: { part: Part; role: string; visit: Visit }): Part {
  if (role === 'user') return replaced({ part, found: userAttachment(part), visit });

  if (part.type !== 'tool-result') return part;

  const output = part.output as { type: string; value: Part[] };

  if (output.type !== 'content' || !Array.isArray(output.value)) return part;

  const value = mapList(output.value, (item) =>
    replaced({ part: item, found: toolAttachment(item), visit }),
  );

  return value === output.value ? part : { ...part, output: { ...output, value } };
}

function mapAttachments(messages: ModelMessage[], visit: Visit): ModelMessage[] {
  return mapList(messages, (message) => {
    if (message.role === 'system' || typeof message.content === 'string') return message;

    const content = mapList(message.content as unknown as Part[], (part) =>
      mapPart({ part, role: message.role, visit }),
    );

    return content === (message.content as unknown)
      ? message
      : ({ ...message, content } as unknown as ModelMessage);
  });
}

function hashOf({ data, hashes }: { data: InlineData; hashes: AttachmentHashes }): string {
  const cached = hashes.get(data.key);

  if (cached) return cached;

  const hash = createHash('sha256').update(data.bytes()).digest('hex');

  hashes.set(data.key, hash);

  return hash;
}

function slotFor({
  attachment: { mediaType, filename, data },
  hashes,
}: {
  attachment: Attachment;
  hashes: AttachmentHashes;
}): Slot {
  const certain = !data || kindIsCertain({ mediaType, filename });
  const head = certain ? undefined : data.head();

  return {
    kind: attachmentKind({ mediaType, filename, head }),
    filename,
    data,
    size: data?.size,
    hash: data ? () => hashOf({ data, hashes }) : undefined,
  };
}

export function markRepeated(slots: AttachmentSlot[]) {
  const seen = new Set<string>();

  for (const slot of [...slots].reverse()) {
    if (!slot.hash) continue;

    const hash = slot.hash();

    if (seen.has(hash)) slot.replacement = repeatedMarker(slot);

    seen.add(hash);
  }
}

function markUnreadable({ slots, inputs }: { slots: Slot[]; inputs?: ModelModality[] }) {
  for (const slot of slots) {
    if (slot.replacement !== undefined) continue;

    const { kind } = slot;

    if (isMediaKind(kind) && inputs && !inputs.includes(kind)) {
      slot.replacement = unreadableMarker({ kind, filename: slot.filename });
    } else if (kind === 'binary') {
      slot.replacement = unsupportedMarker(slot);
    } else if (kind === 'text' && slot.data) {
      slot.replacement = textAttachment({
        filename: slot.filename,
        text: decodeText(slot.data.bytes()),
      });
    }
  }
}

type SentMedia = AttachmentSlot & { kind: AttachmentMediaKind; size: number };

function sentMedia({
  slots,
  inputs,
}: {
  slots: AttachmentSlot[];
  inputs?: ModelModality[];
}): SentMedia[] {
  return slots.filter(
    (slot): slot is SentMedia =>
      slot.replacement === undefined &&
      slot.size !== undefined &&
      slot.kind !== undefined &&
      isMediaKind(slot.kind) &&
      (!inputs || inputs.includes(slot.kind)),
  );
}

function remove(slot: SentMedia) {
  slot.replacement = removedMarker({ kind: slot.kind, filename: slot.filename });
}

function boundSize(media: SentMedia[]) {
  const total = media.reduce((sum, slot) => sum + slot.size, 0);

  if (total <= SIZE_TRIGGER) return;

  let removed = 0;

  for (const slot of media) {
    if (total - removed <= SIZE_TARGET) break;

    removed += slot.size;
    remove(slot);
  }
}

function boundImageCount({ media, provider }: { media: SentMedia[]; provider: string }) {
  const limit = IMAGE_COUNT_LIMITS[provider];

  if (limit === undefined) return;

  const images = media.filter((slot) => slot.kind === 'image' && slot.replacement === undefined);

  images.slice(0, Math.max(images.length - limit, 0)).forEach(remove);
}

export function boundMedia({
  slots,
  inputs,
  provider,
}: {
  slots: AttachmentSlot[];
  inputs?: ModelModality[];
  provider: string;
}) {
  const media = sentMedia({ slots, inputs });

  boundSize(media);
  boundImageCount({ media, provider });
}

export function toModelInput({
  messages,
  inputs,
  provider,
  hashes,
}: {
  messages: ModelMessage[];
  inputs: ModelModality[] | undefined;
  provider: string;
  hashes: AttachmentHashes;
}): ModelMessage[] {
  const slots: Slot[] = [];

  mapAttachments(messages, (attachment) => {
    slots.push(slotFor({ attachment, hashes }));

    return undefined;
  });

  if (slots.length === 0) return messages;

  markRepeated(slots);
  markUnreadable({ slots, inputs });
  boundMedia({ slots, inputs, provider });

  let index = 0;

  return mapAttachments(messages, () => slots[index++]!.replacement);
}
