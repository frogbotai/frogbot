import { definePiece, type PieceOAuthRecipe } from 'frogbot/pieces';
import { z } from 'zod';

import { customApiCall } from './actions/customApiCall.js';
import {
  copyFile,
  copyFolder,
  createFolder,
  createTextFile,
  deleteFile,
  deleteFolder,
  downloadFile,
  getTemporaryLink,
  moveFile,
  moveFolder,
  uploadFile,
} from './actions/files.js';
import { listFolder, searchFiles } from './actions/list.js';
import {
  createDropboxClient,
  type DropboxAuth,
  dropboxAuth,
  type DropboxClient,
} from './client.js';
import { newFolder } from './triggers/newFolder.js';

export type { DropboxAuth, DropboxClient } from './client.js';
export { dropboxAuth } from './client.js';

export const dropboxActions = [
  'searchFiles',
  'createTextFile',
  'uploadFile',
  'downloadFile',
  'getTemporaryLink',
  'deleteFile',
  'moveFile',
  'copyFile',
  'createFolder',
  'deleteFolder',
  'moveFolder',
  'copyFolder',
  'listFolder',
  'customApiCall',
];
export const dropboxScopes = [
  'files.metadata.write',
  'files.metadata.read',
  'files.content.write',
  'files.content.read',
];

const accountSchema = z.object({
  account_id: z.string().min(1),
  name: z.object({ display_name: z.string().min(1) }),
  email: z.string().email(),
});

export const dropboxOAuth = {
  authorizationUrl: 'https://www.dropbox.com/oauth2/authorize',
  tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
  scopes: dropboxScopes,
  pkce: true,
  params: { token_access_type: 'offline' },
  toAuth: ({ tokens }) => ({
    accessToken: tokens.access_token ?? '',
    refreshToken: tokens.refresh_token,
  }),
  async account({ client, req }) {
    const account = await client.rpc(
      'users/get_current_account',
      null,
      accountSchema,
      req.signal ?? undefined,
    );

    return { id: account.account_id, label: account.name.display_name, email: account.email };
  },
} satisfies PieceOAuthRecipe<DropboxAuth, DropboxClient>;

export const createDropbox = definePiece({
  slug: 'dropbox',
  label: 'Dropbox',
  admin: {
    description: 'Store, find, organize, and download Dropbox files and folders',
    group: 'Content and Files',
  },
  auth: dropboxAuth,
  client: createDropboxClient,
  oauth: dropboxOAuth,
  actions: [
    searchFiles,
    createTextFile,
    uploadFile,
    downloadFile,
    getTemporaryLink,
    deleteFile,
    moveFile,
    copyFile,
    createFolder,
    deleteFolder,
    moveFolder,
    copyFolder,
    listFolder,
    customApiCall,
  ],
  triggers: [newFolder],
});
