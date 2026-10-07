import { z } from 'zod';

import { requestSignal } from '../client.js';
import { defineAction } from '../define.js';
import { fileReference, loadFile, responseBytes, saveFile } from '../files.js';
import { metadata, metadataResult, savedFile } from '../schemas.js';

const pathInput = z.object({ path: z.string() });
const transferInput = z.object({
  fromPath: z.string().min(1),
  toPath: z.string().min(1),
  autorename: z.boolean().default(false),
  allowOwnershipTransfer: z.boolean().default(false),
});

const uploadOptions = {
  autorename: z.boolean().default(false),
  mute: z.boolean().optional(),
  strictConflict: z.boolean().optional(),
};

const uploadResult = metadata;

function transfer<const TSlug extends string>(slug: TSlug, operation: string) {
  return defineAction({
    slug,
    description: `${operation === 'copy_v2' ? 'Copy' : 'Move'} a Dropbox ${slug.endsWith('File') ? 'file' : 'folder'}.`,
    input: transferInput,
    output: metadataResult,
    idempotent: false,
    async run({ client, input, req }) {
      return client.rpc(
        `files/${operation}`,
        {
          from_path: input.fromPath,
          to_path: input.toPath,
          autorename: input.autorename,
          allow_ownership_transfer: input.allowOwnershipTransfer,
        },
        metadataResult,
        requestSignal(req),
      );
    },
  });
}

function remove<const TSlug extends string>(slug: TSlug) {
  return defineAction({
    slug,
    description: `Delete a Dropbox ${slug.endsWith('File') ? 'file' : 'folder'}.`,
    input: pathInput,
    output: metadataResult,
    idempotent: false,
    async run({ client, input, req }) {
      return client.rpc(
        'files/delete_v2',
        { path: input.path },
        metadataResult,
        requestSignal(req),
      );
    },
  });
}

export const copyFile = transfer('copyFile', 'copy_v2');
export const copyFolder = transfer('copyFolder', 'copy_v2');
export const moveFile = transfer('moveFile', 'move_v2');
export const moveFolder = transfer('moveFolder', 'move_v2');
export const deleteFile = remove('deleteFile');
export const deleteFolder = remove('deleteFolder');

const createFolderInput = z.object({
  path: z.string().min(1),
  autorename: z.boolean().default(false),
});

export const createFolder = defineAction({
  slug: 'createFolder',
  description: 'Create an empty Dropbox folder.',
  input: createFolderInput,
  output: metadataResult,
  idempotent: false,
  async run({ client, input, req }) {
    return client.rpc('files/create_folder_v2', input, metadataResult, requestSignal(req));
  },
});

const createTextFileInput = z.object({
  path: z.string().min(1),
  text: z.string(),
  ...uploadOptions,
});

export const createTextFile = defineAction({
  slug: 'createTextFile',
  description: 'Create a Dropbox file from text.',
  input: createTextFileInput,
  output: uploadResult,
  idempotent: false,
  async run({ client, input, req }) {
    return client.content({
      path: 'files/upload',
      args: {
        path: input.path,
        mode: 'add',
        autorename: input.autorename,
        mute: input.mute,
        strict_conflict: input.strictConflict,
      },
      body: Buffer.from(input.text, 'utf8'),
      schema: uploadResult,
      signal: requestSignal(req),
    });
  },
});

const uploadFileInput = z.object({
  path: z.string().min(1),
  file: fileReference,
  ...uploadOptions,
});

export const uploadFile = defineAction({
  slug: 'uploadFile',
  description: 'Upload a FrogBot file to Dropbox.',
  input: uploadFileInput,
  output: uploadResult,
  idempotent: false,
  async run({ client, input, req }) {
    const body = await loadFile({ req, file: input.file });

    return client.content({
      path: 'files/upload',
      args: {
        path: input.path,
        mode: 'add',
        autorename: input.autorename,
        mute: input.mute,
        strict_conflict: input.strictConflict,
      },
      body,
      schema: uploadResult,
      signal: requestSignal(req),
    });
  },
});

export const downloadFile = defineAction({
  slug: 'downloadFile',
  description: 'Download a Dropbox file into FrogBot files.',
  input: pathInput,
  output: z.object({ file: savedFile }),
  idempotent: true,
  async run({ client, input, req }) {
    const response = await client.request('https://content.dropboxapi.com/2/files/download', {
      headers: {
        'content-type': 'application/octet-stream',
        'dropbox-api-arg': JSON.stringify({ path: input.path }),
      },
      signal: requestSignal(req),
    });

    const name = input.path.match(/[^/]+$/)?.[0] ?? 'download';
    const file = await saveFile({
      req,
      data: responseBytes(response.body),
      name,
      mimeType: response.headers['content-type']?.split(';')[0] ?? 'application/octet-stream',
    });

    return { file };
  },
});

const temporaryLink = z
  .object({
    metadata,
    link: z.string().url(),
  })
  .catchall(z.json());

export const getTemporaryLink = defineAction({
  slug: 'getTemporaryLink',
  description: 'Get a temporary download link for a Dropbox file.',
  input: pathInput,
  output: temporaryLink,
  idempotent: true,
  async run({ client, input, req }) {
    return client.rpc(
      'files/get_temporary_link',
      { path: input.path },
      temporaryLink,
      requestSignal(req),
    );
  },
});
