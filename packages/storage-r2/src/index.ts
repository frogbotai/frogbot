import { r2Storage as _r2Storage } from '@payloadcms/storage-r2'
import type { Plugin } from 'frogbot'

export type { R2StorageOptions } from '@payloadcms/storage-r2'

type R2StorageOptions = Parameters<typeof _r2Storage>[0]

export const r2Storage = (options: R2StorageOptions): Plugin =>
  _r2Storage(options) as unknown as Plugin
