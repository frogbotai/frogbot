import { vercelBlobStorage as _vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import type { Plugin } from 'frogbot'

export type { VercelBlobStorageOptions } from '@payloadcms/storage-vercel-blob'

type VercelBlobStorageOptions = Parameters<typeof _vercelBlobStorage>[0]

export const vercelBlobStorage = (options: VercelBlobStorageOptions): Plugin =>
  _vercelBlobStorage(options) as unknown as Plugin
