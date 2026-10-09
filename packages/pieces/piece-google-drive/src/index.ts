import { googleOAuth, googleScopes } from '@frogbotai/piece-google';
import { definePiece } from 'frogbot/pieces';

import { customApiCall } from './actions/customApiCall.js';
import {
  copyFile,
  createFile,
  createFolder,
  deleteFile,
  downloadFile,
  exportPdf,
  getFile,
  moveFile,
  trashFile,
  uploadFile,
} from './actions/files.js';
import { listFiles, searchFiles } from './actions/list.js';
import { createPermission, deletePermission, setPublicAccess } from './actions/permissions.js';
import { createGoogleDriveClient, googleDriveAuth } from './client.js';

export type {
  CopyFileInput,
  CreateFileInput,
  CreateFolderInput,
  DeleteFileInput,
  DownloadFileInput,
  ExportPdfInput,
  GetFileInput,
  MoveFileInput,
  TrashFileInput,
  UploadFileInput,
} from './actions/files.js';
export type { ListFilesInput, ListFilesOutput, SearchFilesInput } from './actions/list.js';
export type {
  CreatePermissionInput,
  DeletePermissionInput,
  DeletePermissionOutput,
  SetPublicAccessInput,
  SetPublicAccessOutput,
} from './actions/permissions.js';
export type { GoogleDriveAuth, GoogleDriveClient } from './client.js';
export type { DriveFile, DrivePermission, SavedFile } from './schemas.js';

export const googleDriveActions = [
  'createFolder',
  'createFile',
  'uploadFile',
  'downloadFile',
  'getFile',
  'listFiles',
  'searchFiles',
  'copyFile',
  'exportPdf',
  'createPermission',
  'deletePermission',
  'setPublicAccess',
  'moveFile',
  'deleteFile',
  'trashFile',
  'customApiCall',
] as const;
export const googleDriveScopes = {
  drive: 'https://www.googleapis.com/auth/drive',
  'drive.file': 'https://www.googleapis.com/auth/drive.file',
  'drive.readonly': 'https://www.googleapis.com/auth/drive.readonly',
  'drive.metadata': 'https://www.googleapis.com/auth/drive.metadata',
  'drive.metadata.readonly': 'https://www.googleapis.com/auth/drive.metadata.readonly',
  'drive.appdata': 'https://www.googleapis.com/auth/drive.appdata',
  'drive.activity': 'https://www.googleapis.com/auth/drive.activity',
  'drive.activity.readonly': 'https://www.googleapis.com/auth/drive.activity.readonly',
} as const;

export const createGoogleDrive = definePiece({
  slug: 'google-drive',
  label: 'Google Drive',
  admin: {
    description: 'Store, find, organize, and share Google Drive files',
    group: 'Content and Files',
  },
  auth: googleDriveAuth,
  client: createGoogleDriveClient,
  oauth: {
    ...googleOAuth,
    scopes: {
      catalog: { ...googleScopes, ...googleDriveScopes },
      defaults: ['drive'],
      required: googleOAuth.scopes.required,
    },
    toAuth: ({ tokens }) => ({
      accessToken: tokens.access_token ?? '',
      refreshToken: tokens.refresh_token,
    }),
  },
  actions: [
    createFolder,
    createFile,
    uploadFile,
    downloadFile,
    getFile,
    listFiles,
    searchFiles,
    copyFile,
    exportPdf,
    createPermission,
    deletePermission,
    setPublicAccess,
    moveFile,
    deleteFile,
    trashFile,
    customApiCall,
  ],
});
