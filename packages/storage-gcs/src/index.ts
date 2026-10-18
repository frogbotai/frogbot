import { gcsStorage as _gcsStorage } from '@payloadcms/storage-gcs';
import type { StorageAdapter } from 'frogbot';
import type { StorageAdapterOptions } from 'frogbot/internal';
import { storageAdapter } from 'frogbot/internal';

type PayloadGcsStorageOptions = Parameters<typeof _gcsStorage>[0];

export type GcsStorageOptions = StorageAdapterOptions<PayloadGcsStorageOptions>;

export const gcsStorage = (options: GcsStorageOptions): StorageAdapter =>
  storageAdapter<PayloadGcsStorageOptions>({ options, adapter: _gcsStorage });
