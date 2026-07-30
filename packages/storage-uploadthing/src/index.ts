import { uploadthingStorage as _uploadthingStorage } from '@payloadcms/storage-uploadthing'
import type { Plugin } from 'frogbot'

export type { UploadthingStorageOptions } from '@payloadcms/storage-uploadthing'

type UploadthingStorageOptions = Parameters<typeof _uploadthingStorage>[0]

export const uploadthingStorage = (options: UploadthingStorageOptions): Plugin =>
  _uploadthingStorage(options) as unknown as Plugin
