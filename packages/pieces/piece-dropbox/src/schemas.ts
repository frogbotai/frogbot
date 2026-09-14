import { z } from 'zod';

export const jsonObject = z.record(z.string(), z.json());

const fileMetadata = z
  .object({
    '.tag': z.literal('file'),
    name: z.string(),
    id: z.string(),
    path_lower: z.string().optional(),
    path_display: z.string().optional(),
    client_modified: z.string().optional(),
    server_modified: z.string().optional(),
    rev: z.string().optional(),
    size: z.number().nonnegative().optional(),
  })
  .catchall(z.json());

export const folderMetadata = z
  .object({
    '.tag': z.literal('folder'),
    name: z.string(),
    id: z.string(),
    path_lower: z.string().optional(),
    path_display: z.string().optional(),
  })
  .catchall(z.json());

const deletedMetadata = z
  .object({
    '.tag': z.literal('deleted'),
    name: z.string(),
    path_lower: z.string().optional(),
    path_display: z.string().optional(),
  })
  .catchall(z.json());

export const metadata = z.discriminatedUnion('.tag', [
  fileMetadata,
  folderMetadata,
  deletedMetadata,
]);

export const metadataResult = z.object({ metadata }).catchall(z.json());

export const savedFile = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().nonnegative(),
  url: z.string().optional(),
});

export type SavedFile = z.output<typeof savedFile>;
