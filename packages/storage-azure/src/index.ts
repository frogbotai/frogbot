import type { Plugin } from 'frogbot'
import { azureStorage as _azureStorage, getStorageClient } from '@payloadcms/storage-azure'

export { getStorageClient }
export type { AzureStorageOptions } from '@payloadcms/storage-azure'

type AzureStorageOptions = Parameters<typeof _azureStorage>[0]

export const azureStorage = (options: AzureStorageOptions): Plugin =>
  _azureStorage(options) as unknown as Plugin
