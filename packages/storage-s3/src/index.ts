import type { FrogbotPlugin } from 'frogbot'
import { s3Storage as _s3Storage } from '@payloadcms/storage-s3'

export type { S3StorageOptions } from '@payloadcms/storage-s3'

type S3StorageOptions = Parameters<typeof _s3Storage>[0]

export const s3Storage = (options: S3StorageOptions): FrogbotPlugin =>
  _s3Storage(options) as unknown as FrogbotPlugin
