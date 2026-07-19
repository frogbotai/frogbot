import type { FrogbotPlugin } from 'frogbot'
import { uploadthingStorage as _uploadthingStorage } from '@payloadcms/storage-uploadthing'

export type { UploadthingStorageOptions } from '@payloadcms/storage-uploadthing'

type UploadthingStorageOptions = Parameters<typeof _uploadthingStorage>[0]

export const uploadthingStorage = (options: UploadthingStorageOptions): FrogbotPlugin =>
  _uploadthingStorage(options) as unknown as FrogbotPlugin
