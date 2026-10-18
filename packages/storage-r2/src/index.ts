import { r2Storage as _r2Storage } from '@payloadcms/storage-r2';
import type { StorageAdapter } from 'frogbot';
import type { StorageAdapterOptions } from 'frogbot/internal';
import { storageAdapter } from 'frogbot/internal';

type PayloadR2StorageOptions = Parameters<typeof _r2Storage>[0];

export type R2StorageOptions = StorageAdapterOptions<PayloadR2StorageOptions>;

export const r2Storage = (options: R2StorageOptions): StorageAdapter =>
  storageAdapter<PayloadR2StorageOptions>({ options, adapter: _r2Storage });
