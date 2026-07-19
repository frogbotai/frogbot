import type { FrogbotPlugin } from 'frogbot'
import { gcsStorage as _gcsStorage } from '@payloadcms/storage-gcs'

export type { GcsStorageOptions } from '@payloadcms/storage-gcs'

type GcsStorageOptions = Parameters<typeof _gcsStorage>[0]

export const gcsStorage = (options: GcsStorageOptions): FrogbotPlugin =>
  _gcsStorage(options) as unknown as FrogbotPlugin
