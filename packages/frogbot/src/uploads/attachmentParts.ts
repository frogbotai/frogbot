export type AttachmentKind = 'image' | 'audio' | 'video' | 'pdf' | 'text' | 'binary';

export type AttachmentMediaKind = Extract<AttachmentKind, 'image' | 'audio' | 'video' | 'pdf'>;

export type AttachmentFile = {
  mediaType?: string;
  filename?: string;
};

export const HEAD_BYTES = 4096;

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const EXTENSION_TYPES = new Map([
  ['gif', 'image/gif'],
  ['jpeg', 'image/jpeg'],
  ['jpg', 'image/jpeg'],
  ['pdf', 'application/pdf'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
]);

const TEXT_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/toml',
  'application/x-toml',
  'application/x-yaml',
  'application/xml',
  'application/yaml',
]);

const TEXT_EXTENSIONS = new Set([
  'c',
  'cc',
  'cjs',
  'conf',
  'cpp',
  'css',
  'csv',
  'cts',
  'env',
  'go',
  'gql',
  'graphql',
  'h',
  'hh',
  'hpp',
  'htm',
  'html',
  'ini',
  'java',
  'js',
  'json',
  'jsx',
  'log',
  'md',
  'mdx',
  'mjs',
  'mts',
  'py',
  'rb',
  'rs',
  'sass',
  'scss',
  'sh',
  'sql',
  'toml',
  'ts',
  'tsx',
  'txt',
  'xml',
  'yaml',
  'yml',
  'zsh',
]);

const KIND_WORDS: Record<AttachmentKind, string> = {
  image: 'image',
  audio: 'audio',
  video: 'video',
  pdf: 'PDF',
  text: 'text',
  binary: 'file',
};

const MEDIA_PLURALS: Record<AttachmentMediaKind, string> = {
  image: 'images',
  audio: 'audio',
  video: 'video',
  pdf: 'PDFs',
};

function normalizeType(mediaType: string | undefined): string {
  const type = mediaType?.split(';', 1)[0]?.trim().toLowerCase() ?? '';

  return type.endsWith('/*') ? type.slice(0, -2) : type;
}

function fileExtension(filename: string | undefined): string {
  const index = filename?.lastIndexOf('.') ?? -1;

  return index === -1 ? '' : filename!.slice(index + 1).toLowerCase();
}

function isTextType(type: string): boolean {
  if (type === 'text' || type.startsWith('text/') || TEXT_TYPES.has(type)) return true;

  return type.endsWith('+json') || type.endsWith('+xml');
}

function isUntyped(type: string): boolean {
  return !type || type === 'application/octet-stream';
}

function certainKind({ mediaType, filename }: AttachmentFile): 'image' | 'pdf' | undefined {
  const type = normalizeType(mediaType);

  if (type === 'image' || IMAGE_TYPES.has(type)) return 'image';

  if (type === 'application/pdf') return 'pdf';

  if (!isUntyped(type)) return undefined;

  const extensionType = EXTENSION_TYPES.get(fileExtension(filename));

  if (!extensionType) return undefined;

  return extensionType === 'application/pdf' ? 'pdf' : 'image';
}

export function sentMediaType({ mediaType, filename }: AttachmentFile): string | undefined {
  if (!isUntyped(normalizeType(mediaType))) return mediaType;

  return EXTENSION_TYPES.get(fileExtension(filename)) ?? mediaType;
}

export function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, HEAD_BYTES);

  if (sample.length === 0) return true;

  let control = 0;

  for (const byte of sample) {
    if (byte === 0) return false;

    if (byte < 9 || (byte > 13 && byte < 32)) control += 1;
  }

  return control / sample.length <= 0.3;
}

export function kindIsCertain(file: AttachmentFile): boolean {
  return certainKind(file) !== undefined;
}

export function attachmentKind({
  mediaType,
  filename,
  head,
}: AttachmentFile & { head?: Uint8Array }): AttachmentKind {
  const certain = certainKind({ mediaType, filename });

  if (certain) return certain;

  if (head && looksLikeText(head)) return 'text';

  const type = normalizeType(mediaType);
  const topLevel = type.split('/', 1)[0];

  if (topLevel === 'audio' || topLevel === 'video') return topLevel;

  if (head) return 'binary';

  return isTextType(type) || TEXT_EXTENSIONS.has(fileExtension(filename)) ? 'text' : 'binary';
}

export function isMediaKind(kind: AttachmentKind): kind is AttachmentMediaKind {
  return kind === 'image' || kind === 'audio' || kind === 'video' || kind === 'pdf';
}

export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

export function textLabel({ filename, origin }: { filename?: string; origin?: 'paste' }): string {
  if (origin === 'paste') return 'Pasted text:';

  const name = filename?.trim();

  return name ? `Attached file "${name}":` : 'Attached file:';
}

export function textAttachment({
  filename,
  origin,
  text,
}: {
  filename?: string;
  origin?: 'paste';
  text: string;
}): string {
  return `${textLabel({ filename, origin })}\n${text}`;
}

function markerName({ kind, filename }: { kind?: AttachmentKind; filename?: string }): string {
  return filename?.trim() || KIND_WORDS[kind ?? 'binary'];
}

export function unreadableMarker(file: { kind: AttachmentMediaKind; filename?: string }): string {
  return `[Can't read ${markerName(file)}: this model doesn't accept ${MEDIA_PLURALS[file.kind]}]`;
}

export function unsupportedMarker(file: { filename?: string }): string {
  return `[Can't read ${markerName(file)}: this file type isn't supported]`;
}

export function unavailableMarker(file: { kind?: AttachmentKind; filename?: string }): string {
  return `[Can't read ${markerName(file)}: the file couldn't be loaded]`;
}

export function repeatedMarker(file: { kind?: AttachmentKind; filename?: string }): string {
  return `[File repeated later: ${markerName(file)}]`;
}

export function removedMarker(file: { kind: AttachmentMediaKind; filename?: string }): string {
  const label = file.kind === 'image' ? 'Image removed' : 'File removed';

  return `[${label}: ${markerName(file)}]`;
}
