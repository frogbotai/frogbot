import { vercelBlobStorage as _vercelBlobStorage } from '@payloadcms/storage-vercel-blob';
import type { Plugin } from 'frogbot';
import type { StorageAdapterOptions } from 'frogbot/internal';
import { storageAdapter } from 'frogbot/internal';

type PayloadVercelBlobStorageOptions = Parameters<typeof _vercelBlobStorage>[0];

export type VercelBlobStorageOptions = StorageAdapterOptions<PayloadVercelBlobStorageOptions>;

export const vercelBlobStorage = (options: VercelBlobStorageOptions): Plugin =>
  storageAdapter<PayloadVercelBlobStorageOptions>({ options, plugin: _vercelBlobStorage });
