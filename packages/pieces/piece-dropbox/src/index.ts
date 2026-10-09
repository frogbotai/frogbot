import { definePiece, type PieceOAuthAccount, type PieceOAuthRecipe } from 'frogbot/pieces';
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
export const dropboxScopes = {
  'account_info.read': 'account_info.read',
  'account_info.write': 'account_info.write',
  'files.metadata.read': 'files.metadata.read',
  'files.metadata.write': 'files.metadata.write',
  'files.content.read': 'files.content.read',
  'files.content.write': 'files.content.write',
  'file_requests.read': 'file_requests.read',
  'file_requests.write': 'file_requests.write',
  'sharing.read': 'sharing.read',
  'sharing.write': 'sharing.write',
  'contacts.read': 'contacts.read',
  'contacts.write': 'contacts.write',
  openid: 'openid',
  email: 'email',
  profile: 'profile',
} as const;

const accountSchema = z.object({
  account_id: z.string().min(1),
  name: z.object({ display_name: z.string().min(1) }),
  email: z.string().email(),
});

export const dropboxOAuth = {
  authorizationUrl: 'https://www.dropbox.com/oauth2/authorize',
  tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
  scopes: {
    catalog: dropboxScopes,
    defaults: [
      'files.metadata.write',
      'files.metadata.read',
      'files.content.write',
      'files.content.read',
    ],
  },
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
} satisfies PieceOAuthRecipe<
  DropboxAuth,
  DropboxClient,
  PieceOAuthAccount,
  keyof typeof dropboxScopes
>;

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
