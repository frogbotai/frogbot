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

export const TEXT_EXTENSIONS = new Set([
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

export const BLOCKED_EXTENSIONS = new Set([
  'action',
  'app',
  'asp',
  'aspx',
  'bat',
  'cmd',
  'com',
  'command',
  'cpl',
  'deb',
  'desktop',
  'dll',
  'dmg',
  'ear',
  'exe',
  'hta',
  'htm',
  'html',
  'jar',
  'js',
  'jse',
  'jsp',
  'lnk',
  'msi',
  'php',
  'phtml',
  'pkg',
  'pl',
  'ps1',
  'psc1',
  'psd1',
  'psh',
  'psm1',
  'py',
  'rb',
  'reg',
  'rpm',
  'scr',
  'shtml',
  'url',
  'vbe',
  'vbs',
  'war',
  'workflow',
  'ws',
  'wsc',
  'wsf',
  'wsh',
  'xhtml',
]);

export const BLOCKED_TYPES = new Set([
  'application/java-archive',
  'application/vnd.microsoft.portable-executable',
  'application/x-apple-diskimage',
  'application/x-apple-installer',
  'application/x-asp',
  'application/x-command',
  'application/x-cpl',
  'application/x-debian-package',
  'application/x-desktop',
  'application/x-executable',
  'application/x-hta',
  'application/x-httpd-php',
  'application/x-jsp',
  'application/x-ms-dos-executable',
  'application/x-ms-shortcut',
  'application/x-ms-wsh',
  'application/x-msdos-program',
  'application/x-msdownload',
  'application/x-msi',
  'application/x-powershell',
  'application/x-redhat-package-manager',
  'application/x-registry',
  'application/x-url',
  'application/x-vbscript',
  'application/x-workflow',
  'application/xhtml+xml',
  'text/html',
  'text/javascript',
  'text/x-perl',
  'text/x-python',
  'text/x-ruby',
]);

const MEDIA_ACCEPT: Record<AttachmentMediaKind, string[]> = {
  image: [...IMAGE_TYPES],
  audio: ['audio/*'],
  video: ['video/*'],
  pdf: ['application/pdf', '.pdf'],
};

const MEDIA_KINDS: AttachmentMediaKind[] = ['image', 'audio', 'video', 'pdf'];

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

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, HEAD_BYTES);

  if (sample.length === 0) return true;

  let control = 0;

  for (const byte of sample) {
    if (byte === 0) return false;

    if (byte < 9 || (byte > 13 && byte < 32)) control += 1;
  }

  return control / sample.length <= 0.3;
}

export function isMediaKind(kind: AttachmentKind): kind is AttachmentMediaKind {
  return kind === 'image' || kind === 'audio' || kind === 'video' || kind === 'pdf';
}

export function kindFrom({
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

export async function attachmentKind(file: File): Promise<AttachmentKind> {
  const certain = certainKind({ mediaType: file.type, filename: file.name });

  if (certain) return certain;

  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());

  return kindFrom({ mediaType: file.type, filename: file.name, head });
}

export function isUploadBlocked({ name, type }: { name: string; type: string }): boolean {
  return BLOCKED_EXTENSIONS.has(fileExtension(name)) || BLOCKED_TYPES.has(normalizeType(type));
}

export function extensionLabel(filename?: string): string | undefined {
  const extension = fileExtension(filename);

  return extension && extension.length <= 5 ? extension.toUpperCase() : undefined;
}

export function typeLabel({ filename, origin }: { filename?: string; origin?: 'paste' }): string {
  if (origin === 'paste') return 'PASTED';

  return extensionLabel(filename) ?? 'TEXT';
}

export function acceptFor(modelInputs?: readonly (AttachmentMediaKind | 'text')[]): string {
  const extensions = [...TEXT_EXTENSIONS].map((extension) => `.${extension}`);
  const text = ['text/*', ...TEXT_TYPES, '.svg', ...extensions];
  const media = modelInputs
    ? MEDIA_KINDS.filter((kind) => modelInputs.includes(kind))
    : MEDIA_KINDS;

  return [...text, ...media.flatMap((kind) => MEDIA_ACCEPT[kind])].join(',');
}
