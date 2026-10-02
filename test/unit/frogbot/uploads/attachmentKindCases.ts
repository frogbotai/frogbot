import type { AttachmentKind } from '../../../../packages/frogbot/src/uploads/attachmentParts.js';

export type AttachmentKindCase = {
  name: string;
  mediaType: string;
  filename: string;
  head?: Uint8Array;
  kind: AttachmentKind;
};

const text = (value: string) => new TextEncoder().encode(value);

const bytes = (...values: number[]) => Uint8Array.from(values);

const binary = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00);

export const attachmentKindCases: AttachmentKindCase[] = [
  { name: 'PNG', mediaType: 'image/png', filename: 'photo.png', head: binary, kind: 'image' },
  { name: 'JPEG', mediaType: 'image/jpeg', filename: 'photo.jpg', head: binary, kind: 'image' },
  { name: 'GIF', mediaType: 'image/gif', filename: 'loop.gif', head: binary, kind: 'image' },
  { name: 'WebP', mediaType: 'image/webp', filename: 'photo.webp', head: binary, kind: 'image' },
  { name: 'upper-case image type', mediaType: 'IMAGE/PNG', filename: 'photo', kind: 'image' },
  { name: 'top-level image type', mediaType: 'image', filename: 'photo', kind: 'image' },
  { name: 'wildcard image type', mediaType: 'image/*', filename: 'photo', kind: 'image' },
  { name: 'PNG with no type', mediaType: '', filename: 'photo.png', head: binary, kind: 'image' },
  {
    name: 'JPEG sent as octet-stream',
    mediaType: 'application/octet-stream',
    filename: 'photo.JPEG',
    head: binary,
    kind: 'image',
  },
  { name: 'PDF', mediaType: 'application/pdf', filename: 'report.pdf', kind: 'pdf' },
  {
    name: '.pdf sent as octet-stream',
    mediaType: 'application/octet-stream',
    filename: 'report.pdf',
    head: text('%PDF-1.7\n%\u00e2\u00e3'),
    kind: 'pdf',
  },
  { name: '.pdf with no type', mediaType: '', filename: 'report.pdf', kind: 'pdf' },
  { name: 'MP3', mediaType: 'audio/mpeg', filename: 'song.mp3', head: binary, kind: 'audio' },
  { name: 'audio without contents', mediaType: 'audio/wav', filename: 'memo.wav', kind: 'audio' },
  { name: 'MP4', mediaType: 'video/mp4', filename: 'clip.mp4', head: binary, kind: 'video' },
  {
    name: '.ts recorded as video/mp2t',
    mediaType: 'video/mp2t',
    filename: 'index.ts',
    head: text('export const answer = 42;\n'),
    kind: 'text',
  },
  {
    name: 'real MPEG-TS video',
    mediaType: 'video/mp2t',
    filename: 'stream.ts',
    head: bytes(0x47, 0x40, 0x00, 0x10, 0x00, 0x00, 0xb0, 0x0d),
    kind: 'video',
  },
  {
    name: 'SVG',
    mediaType: 'image/svg+xml',
    filename: 'logo.svg',
    head: text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    kind: 'text',
  },
  { name: 'SVG without contents', mediaType: 'image/svg+xml', filename: 'logo.svg', kind: 'text' },
  { name: 'HEIC', mediaType: 'image/heic', filename: 'photo.heic', head: binary, kind: 'binary' },
  {
    name: 'HEIC without contents',
    mediaType: 'image/heic',
    filename: 'photo.heic',
    kind: 'binary',
  },
  { name: 'BMP', mediaType: 'image/bmp', filename: 'photo.bmp', head: binary, kind: 'binary' },
  {
    name: 'Markdown',
    mediaType: 'text/markdown',
    filename: 'notes.md',
    head: text('# Notes'),
    kind: 'text',
  },
  {
    name: 'text type with parameters',
    mediaType: 'text/plain; charset=utf-8',
    filename: 'notes.txt',
    kind: 'text',
  },
  { name: 'CSV', mediaType: 'text/csv', filename: 'data.csv', kind: 'text' },
  { name: 'JSON', mediaType: 'application/json', filename: 'data.json', kind: 'text' },
  { name: 'YAML', mediaType: 'application/x-yaml', filename: 'config.yml', kind: 'text' },
  { name: 'TOML', mediaType: 'application/toml', filename: 'config.toml', kind: 'text' },
  { name: 'XML', mediaType: 'application/xml', filename: 'feed.xml', kind: 'text' },
  { name: '+json type', mediaType: 'application/vnd.api+json', filename: 'data', kind: 'text' },
  { name: 'code file with no type', mediaType: '', filename: 'main.py', kind: 'text' },
  {
    name: 'code file sent as octet-stream',
    mediaType: 'application/octet-stream',
    filename: 'main.go',
    kind: 'text',
  },
  { name: 'dotfile on the text list', mediaType: '', filename: '.env', kind: 'text' },
  {
    name: 'text contents with an unknown type',
    mediaType: 'application/x-custom',
    filename: 'notes.weird',
    head: text('plain words'),
    kind: 'text',
  },
  {
    name: 'unknown type without contents',
    mediaType: 'application/octet-stream',
    filename: 'data.bin',
    kind: 'binary',
  },
  {
    name: 'zip',
    mediaType: 'application/zip',
    filename: 'archive.zip',
    head: bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00),
    kind: 'binary',
  },
  {
    name: 'Word document',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filename: 'report.docx',
    kind: 'binary',
  },
  {
    name: 'empty file',
    mediaType: 'application/octet-stream',
    filename: 'empty',
    head: new Uint8Array(),
    kind: 'text',
  },
  {
    name: 'text type with a zero byte',
    mediaType: 'text/plain',
    filename: 'notes.txt',
    head: text('hello\u0000world'),
    kind: 'binary',
  },
  {
    name: 'exactly 30% control characters',
    mediaType: 'text/plain',
    filename: 'notes.txt',
    head: bytes(1, 2, 3, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67),
    kind: 'text',
  },
  {
    name: 'more than 30% control characters',
    mediaType: 'text/plain',
    filename: 'notes.txt',
    head: bytes(1, 2, 3, 4, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66),
    kind: 'binary',
  },
  {
    name: 'tabs and line breaks',
    mediaType: 'text/plain',
    filename: 'notes.txt',
    head: text('\t\r\n\t\r\n\t\r\nab'),
    kind: 'text',
  },
  {
    name: 'UTF-8 byte-order mark',
    mediaType: 'text/plain',
    filename: 'notes.txt',
    head: bytes(0xef, 0xbb, 0xbf, 0x68, 0x69),
    kind: 'text',
  },
  {
    name: 'invalid UTF-8',
    mediaType: 'text/plain',
    filename: 'latin.txt',
    head: bytes(0x63, 0x61, 0x66, 0xe9),
    kind: 'text',
  },
  {
    name: 'UTF-16',
    mediaType: 'text/plain',
    filename: 'wide.txt',
    head: bytes(0xff, 0xfe, 0x68, 0x00, 0x69, 0x00),
    kind: 'binary',
  },
];
