import { z } from 'zod';

export const encodings = [
  'ascii',
  'utf8',
  'utf16le',
  'ucs2',
  'base64',
  'base64url',
  'latin1',
  'binary',
  'hex',
] as const;

export const encoding = z.enum(encodings);
