import { uploadthingStorage as _uploadthingStorage } from '@payloadcms/storage-uploadthing';
import type { Plugin } from 'frogbot';
import type { StorageAdapterOptions } from 'frogbot/internal';
import { storageAdapter } from 'frogbot/internal';

type PayloadUploadthingStorageOptions = Parameters<typeof _uploadthingStorage>[0];

export type UploadthingStorageOptions = StorageAdapterOptions<PayloadUploadthingStorageOptions>;

export const uploadthingStorage = (options: UploadthingStorageOptions): Plugin =>
  storageAdapter<PayloadUploadthingStorageOptions>({ options, plugin: _uploadthingStorage });
