import { z } from 'zod';

import { type DriveRunArgs, requestOptions } from '../client.js';
import { downloadDriveFile } from '../files.js';
import {
  type DrivePermission,
  fileInput,
  fileOutput,
  folderMimeType,
  permissionOutput,
  role,
  savedFileOutput,
} from '../schemas.js';

const createPermissionInput = fileInput.extend({
  email: z.email(),
  role,
  sendNotificationEmail: z.boolean().default(false),
});
export type CreatePermissionInput = z.input<typeof createPermissionInput>;
export const createPermission = {
  slug: 'createPermission' as const,
  description: 'Grant a role on a Drive file or folder to a user by email.',
  input: createPermissionInput,
  output: permissionOutput,
  idempotent: false,
  async run({
    client,
    input,
    req,
  }: DriveRunArgs<typeof createPermissionInput>): Promise<DrivePermission> {
    return permissionOutput.parse(
      (
        await client.permissions.create(
          {
            fileId: input.fileId,
            requestBody: { type: 'user', role: input.role, emailAddress: input.email },
            sendNotificationEmail: input.sendNotificationEmail,
            supportsAllDrives: input.includeSharedDrives,
            fields: '*',
          },
          requestOptions(req),
        )
      ).data,
    );
  },
};

const deletePermissionInput = fileInput.extend({ email: z.email(), role });
const deletePermissionOutput = z.object({ removed: z.boolean(), message: z.string() });
export type DeletePermissionInput = z.input<typeof deletePermissionInput>;
export type DeletePermissionOutput = z.output<typeof deletePermissionOutput>;
export const deletePermission = {
  slug: 'deletePermission' as const,
  description: 'Remove a Drive permission matching both user email and role.',
  input: deletePermissionInput,
  output: deletePermissionOutput,
  idempotent: true,
  async run({
    client,
    input,
    req,
  }: DriveRunArgs<typeof deletePermissionInput>): Promise<DeletePermissionOutput> {
    let pageToken: string | undefined;
    const tokens = new Set<string>();
    do {
      const response = await client.permissions.list(
        {
          fileId: input.fileId,
          fields: 'nextPageToken,permissions(id,emailAddress,role)',
          pageSize: 100,
          pageToken,
          supportsAllDrives: input.includeSharedDrives,
        },
        requestOptions(req),
      );
      const permission = response.data.permissions?.find(
        (permission) => permission.emailAddress === input.email && permission.role === input.role,
      );
      if (permission) {
        if (!permission.id) throw new Error('[frogbot] Google Drive permission is missing its ID.');
        await client.permissions.delete(
          {
            fileId: input.fileId,
            permissionId: permission.id,
            supportsAllDrives: input.includeSharedDrives,
          },
          requestOptions(req),
        );
        return { removed: true, message: 'Permission removed' };
      }
      pageToken = response.data.nextPageToken ?? undefined;
      if (pageToken) {
        if (tokens.has(pageToken)) throw new Error('[frogbot] Google Drive repeated a page token.');
        tokens.add(pageToken);
      }
    } while (pageToken);
    return { removed: false, message: 'Permission not found' };
  },
};

const setPublicAccessInput = fileInput.extend({
  role: z.enum(['reader', 'commenter', 'writer']).default('reader'),
});
const setPublicAccessOutput = z.object({
  permission: permissionOutput,
  webViewLink: z.string().nullable().optional(),
  download: savedFileOutput.nullable(),
});
export type SetPublicAccessInput = z.input<typeof setPublicAccessInput>;
export type SetPublicAccessOutput = z.output<typeof setPublicAccessOutput>;
export const setPublicAccess = {
  slug: 'setPublicAccess' as const,
  description:
    'Grant anyone-with-link access and return the view link and a FrogBot file download.',
  input: setPublicAccessInput,
  output: setPublicAccessOutput,
  idempotent: false,
  async run({
    client,
    input,
    req,
  }: DriveRunArgs<typeof setPublicAccessInput>): Promise<SetPublicAccessOutput> {
    const permission = permissionOutput.parse(
      (
        await client.permissions.create(
          {
            fileId: input.fileId,
            requestBody: { type: 'anyone', role: input.role, allowFileDiscovery: false },
            supportsAllDrives: input.includeSharedDrives,
            fields: '*',
          },
          requestOptions(req),
        )
      ).data,
    );
    const file = fileOutput.parse(
      (
        await client.files.get(
          {
            fileId: input.fileId,
            fields: 'id,name,mimeType,webViewLink,webContentLink',
            supportsAllDrives: input.includeSharedDrives,
          },
          requestOptions(req),
        )
      ).data,
    );
    const download =
      file.mimeType === folderMimeType
        ? null
        : await downloadDriveFile({
            client,
            req,
            fileId: input.fileId,
            metadata: file,
            includeSharedDrives: input.includeSharedDrives,
          });
    return { permission, webViewLink: file.webViewLink, download };
  },
};
