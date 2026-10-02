import { azureStorage as _azureStorage, getStorageClient } from '@payloadcms/storage-azure';
import type { Plugin } from 'frogbot';
import type { StorageAdapterOptions } from 'frogbot/internal';
import { storageAdapter } from 'frogbot/internal';

export { getStorageClient };

type PayloadAzureStorageOptions = Parameters<typeof _azureStorage>[0];

export type AzureStorageOptions = StorageAdapterOptions<PayloadAzureStorageOptions>;

export const azureStorage = (options: AzureStorageOptions): Plugin =>
  storageAdapter<PayloadAzureStorageOptions>({ options, plugin: _azureStorage });
