import { Readable } from 'node:stream';

import { z } from 'zod';

import { type DriveRunArgs, requestOptions } from '../client.js';
import { contentBytes, downloadDriveFile, fileReference, loadFile } from '../files.js';
import {
  destination,
  type DriveFile,
  fileInput,
  fileOutput,
  folderMimeType,
  id,
  type SavedFile,
  savedFileOutput,
  sharedDrive,
} from '../schemas.js';
import { folderOptions } from './list.js';

const createFolderInput = z.object({ name: id, ...destination });
export type CreateFolderInput = z.input<typeof createFolderInput>;
export const createFolder = {
  slug: 'createFolder' as const,
  description: 'Create a folder in Google Drive.',
  input: createFolderInput,
  output: fileOutput,
  idempotent: false,
  options: { parentFolderId: folderOptions },
  async run({ client, input, req }: DriveRunArgs<typeof createFolderInput>): Promise<DriveFile> {
    return fileOutput.parse(
      (
        await client.files.create(
          {
            requestBody: {
              name: input.name,
              mimeType: folderMimeType,
              parents: input.parentFolderId ? [input.parentFolderId] : undefined,
            },
            supportsAllDrives: input.includeSharedDrives,
            fields: '*',
          },
          requestOptions(req),
        )
      ).data,
    );
  },
};

const createFileInput = z.object({
  name: id,
  text: z.string(),
  mimeType: z.enum(['text/plain', 'text/csv', 'text/xml']).default('text/plain'),
  ...destination,
});
export type CreateFileInput = z.input<typeof createFileInput>;
export const createFile = {
  slug: 'createFile' as const,
  description: 'Create a text, CSV, or XML file in Google Drive.',
  input: createFileInput,
  output: fileOutput,
  idempotent: false,
  options: { parentFolderId: folderOptions },
  async run({ client, input, req }: DriveRunArgs<typeof createFileInput>): Promise<DriveFile> {
    return fileOutput.parse(
      (
        await client.files.create(
          {
            requestBody: {
              name: input.name,
              mimeType: input.mimeType,
              parents: input.parentFolderId ? [input.parentFolderId] : undefined,
            },
            media: { mimeType: input.mimeType, body: Readable.from(Buffer.from(input.text)) },
            supportsAllDrives: input.includeSharedDrives,
            fields: '*',
          },
          requestOptions(req),
        )
      ).data,
    );
  },
};

const uploadFileInput = z.object({ file: fileReference, ...destination });
export type UploadFileInput = z.input<typeof uploadFileInput>;
export const uploadFile = {
  slug: 'uploadFile' as const,
  description: 'Upload an accessible FrogBot file to Google Drive.',
  input: uploadFileInput,
  output: fileOutput,
  idempotent: false,
  options: { parentFolderId: folderOptions },
  async run({ client, input, req }: DriveRunArgs<typeof uploadFileInput>): Promise<DriveFile> {
    const file = await loadFile({ req, file: input.file });
    return fileOutput.parse(
      (
        await client.files.create(
          {
            requestBody: {
              name: file.name,
              parents: input.parentFolderId ? [input.parentFolderId] : undefined,
            },
            media: { mimeType: file.mimeType, body: Readable.from(file.data) },
            supportsAllDrives: input.includeSharedDrives,
            fields: '*',
          },
          requestOptions(req),
        )
      ).data,
    );
  },
};

const downloadFileInput = fileInput.extend({ name: id.optional() });
export type DownloadFileInput = z.input<typeof downloadFileInput>;
export const downloadFile = {
  slug: 'downloadFile' as const,
  description:
    'Download a Drive file into FrogBot files, exporting Google documents to Office formats.',
  input: downloadFileInput,
  output: savedFileOutput,
  idempotent: false,
  async run({ client, input, req }: DriveRunArgs<typeof downloadFileInput>): Promise<SavedFile> {
    return downloadDriveFile({ client, req, ...input });
  },
};

export type GetFileInput = z.input<typeof fileInput>;
export const getFile = {
  slug: 'getFile' as const,
  description: 'Get metadata for a Google Drive file or folder.',
  input: fileInput,
  output: fileOutput,
  idempotent: true,
  async run({ client, input, req }: DriveRunArgs<typeof fileInput>): Promise<DriveFile> {
    return fileOutput.parse(
      (
        await client.files.get(
          {
            fileId: input.fileId,
            supportsAllDrives: input.includeSharedDrives,
            fields: '*',
          },
          requestOptions(req),
        )
      ).data,
    );
  },
};

const copyFileInput = fileInput.extend({
  name: id,
  folderId: id,
  mimeType: z
    .enum(['application/vnd.google-apps.spreadsheet', 'application/vnd.google-apps.document'])
    .optional(),
});
export type CopyFileInput = z.input<typeof copyFileInput>;
export const copyFile = {
  slug: 'copyFile' as const,
  description:
    'Copy a Drive file into a folder, optionally converting to a Google document or spreadsheet.',
  input: copyFileInput,
  output: fileOutput,
  idempotent: false,
  async run({ client, input, req }: DriveRunArgs<typeof copyFileInput>): Promise<DriveFile> {
    return fileOutput.parse(
      (
        await client.files.copy(
          {
            fileId: input.fileId,
            requestBody: { name: input.name, parents: [input.folderId], mimeType: input.mimeType },
            supportsAllDrives: input.includeSharedDrives,
            fields: '*',
          },
          requestOptions(req),
        )
      ).data,
    );
  },
};

const exportPdfInput = z.object({ fileId: id, folderId: id, name: id, ...sharedDrive });
export type ExportPdfInput = z.input<typeof exportPdfInput>;
export const exportPdf = {
  slug: 'exportPdf' as const,
  description: 'Export a Google document to PDF and save it in a Drive folder.',
  input: exportPdfInput,
  output: fileOutput,
  idempotent: false,
  async run({ client, input, req }: DriveRunArgs<typeof exportPdfInput>): Promise<DriveFile> {
    const response = await client.files.export(
      {
        fileId: input.fileId,
        mimeType: 'application/pdf',
      },
      { ...requestOptions(req), responseType: 'arraybuffer' },
    );
    return fileOutput.parse(
      (
        await client.files.create(
          {
            requestBody: {
              name: input.name.toLowerCase().endsWith('.pdf') ? input.name : `${input.name}.pdf`,
              parents: [input.folderId],
              mimeType: 'application/pdf',
            },
            media: {
              mimeType: 'application/pdf',
              body: Readable.from(contentBytes(response.data)),
            },
            supportsAllDrives: input.includeSharedDrives,
            fields: '*',
          },
          requestOptions(req),
        )
      ).data,
    );
  },
};

const moveFileInput = fileInput.extend({ folderId: id });
export type MoveFileInput = z.input<typeof moveFileInput>;
export const moveFile = {
  slug: 'moveFile' as const,
  description: 'Move a Drive file to a folder, removing its other parents.',
  input: moveFileInput,
  output: fileOutput,
  idempotent: true,
  options: { folderId: folderOptions },
  async run({ client, input, req }: DriveRunArgs<typeof moveFileInput>): Promise<DriveFile> {
    const file = (
      await client.files.get(
        {
          fileId: input.fileId,
          fields: '*',
          supportsAllDrives: input.includeSharedDrives,
        },
        requestOptions(req),
      )
    ).data;
    const parents = file.parents ?? [];
    if (parents.length === 1 && parents[0] === input.folderId) return fileOutput.parse(file);
    return fileOutput.parse(
      (
        await client.files.update(
          {
            fileId: input.fileId,
            removeParents:
              parents.filter((parent) => parent !== input.folderId).join(',') || undefined,
            addParents: parents.includes(input.folderId) ? undefined : input.folderId,
            supportsAllDrives: input.includeSharedDrives,
            fields: '*',
          },
          requestOptions(req),
        )
      ).data,
    );
  },
};

export type DeleteFileInput = z.input<typeof fileInput>;
export const deleteFile = {
  slug: 'deleteFile' as const,
  description: 'Permanently delete a Google Drive file or folder.',
  input: fileInput,
  output: z.object({ deleted: z.literal(true) }),
  idempotent: false,
  async run({ client, input, req }: DriveRunArgs<typeof fileInput>): Promise<{ deleted: true }> {
    await client.files.delete(
      {
        fileId: input.fileId,
        supportsAllDrives: input.includeSharedDrives,
      },
      requestOptions(req),
    );
    return { deleted: true };
  },
};

export type TrashFileInput = z.input<typeof fileInput>;
export const trashFile = {
  slug: 'trashFile' as const,
  description: 'Move a Google Drive file or folder to the trash.',
  input: fileInput,
  output: fileOutput,
  idempotent: true,
  async run({ client, input, req }: DriveRunArgs<typeof fileInput>): Promise<DriveFile> {
    return fileOutput.parse(
      (
        await client.files.update(
          {
            fileId: input.fileId,
            requestBody: { trashed: true },
            supportsAllDrives: input.includeSharedDrives,
            fields: '*',
          },
          requestOptions(req),
        )
      ).data,
    );
  },
};
