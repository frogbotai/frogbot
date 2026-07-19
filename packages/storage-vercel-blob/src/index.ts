import type { FrogbotPlugin } from 'frogbot'
import { vercelBlobStorage as _vercelBlobStorage } from '@payloadcms/storage-vercel-blob'

export type { VercelBlobStorageOptions } from '@payloadcms/storage-vercel-blob'

type VercelBlobStorageOptions = Parameters<typeof _vercelBlobStorage>[0]

export const vercelBlobStorage = (options: VercelBlobStorageOptions): FrogbotPlugin =>
  _vercelBlobStorage(options) as unknown as FrogbotPlugin
