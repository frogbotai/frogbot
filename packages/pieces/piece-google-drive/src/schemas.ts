import { z } from 'zod';

export const folderMimeType = 'application/vnd.google-apps.folder';
export const id = z.string().trim().min(1);
export const sharedDrive = { includeSharedDrives: z.boolean().default(false) };
export const fileInput = z.object({ fileId: id, ...sharedDrive });
export const destination = { parentFolderId: id.optional(), ...sharedDrive };
export const role = z.enum(['organizer', 'fileOrganizer', 'writer', 'commenter', 'reader']);

export const permissionOutput = z.looseObject({
  id: z.string().optional(),
  type: z.string().optional(),
  role: z.string().optional(),
  emailAddress: z.string().optional(),
  allowFileDiscovery: z.boolean().optional(),
});

export const fileOutput = z.looseObject({
  id: z.string().optional(),
  name: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  kind: z.string().optional(),
  parents: z.array(z.string()).optional(),
  size: z.string().nullable().optional(),
  trashed: z.boolean().nullable().optional(),
  starred: z.boolean().nullable().optional(),
  shared: z.boolean().nullable().optional(),
  createdTime: z.string().nullable().optional(),
  modifiedTime: z.string().nullable().optional(),
  webViewLink: z.string().nullable().optional(),
  webContentLink: z.string().nullable().optional(),
  permissions: z.array(permissionOutput).optional(),
});

export const savedFileOutput = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string().nullable().optional(),
});

export type DriveFile = z.output<typeof fileOutput>;
export type DrivePermission = z.output<typeof permissionOutput>;
export type SavedFile = z.output<typeof savedFileOutput>;
