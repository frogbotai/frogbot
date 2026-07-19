import type { FrogbotPlugin } from 'frogbot'
import { r2Storage as _r2Storage } from '@payloadcms/storage-r2'

export type { R2StorageOptions } from '@payloadcms/storage-r2'

type R2StorageOptions = Parameters<typeof _r2Storage>[0]

export const r2Storage = (options: R2StorageOptions): FrogbotPlugin =>
  _r2Storage(options) as unknown as FrogbotPlugin
