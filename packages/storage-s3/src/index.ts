import { s3Storage as _s3Storage } from '@payloadcms/storage-s3';
import type { Plugin } from 'frogbot';
import type { StorageAdapterOptions } from 'frogbot/internal';
import { storageAdapter } from 'frogbot/internal';

type PayloadS3StorageOptions = Parameters<typeof _s3Storage>[0];

export type S3StorageOptions = StorageAdapterOptions<PayloadS3StorageOptions>;

export const s3Storage = (options: S3StorageOptions): Plugin =>
  storageAdapter<PayloadS3StorageOptions>({ options, plugin: _s3Storage });
