import type { Plugin } from 'frogbot'
import { gcsStorage as _gcsStorage } from '@payloadcms/storage-gcs'

export type { GcsStorageOptions } from '@payloadcms/storage-gcs'

type GcsStorageOptions = Parameters<typeof _gcsStorage>[0]

export const gcsStorage = (options: GcsStorageOptions): Plugin =>
  _gcsStorage(options) as unknown as Plugin
