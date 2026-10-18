import type {
  StorageAdapter as PayloadStorageAdapter,
  UploadConfig as PayloadUploadConfig,
} from 'payload';

import type { FrogBotRequest } from '../types/request.js';

type PayloadUploadHandler = NonNullable<PayloadUploadConfig['handlers']>[number];

export type UploadHandler = (
  req: FrogBotRequest,
  args: Parameters<PayloadUploadHandler>[1],
) => ReturnType<PayloadUploadHandler>;

export type UploadConfig = Omit<PayloadUploadConfig, 'handlers'> & {
  handlers?: UploadHandler[];
};

export type SanitizedFilesConfig = {
  slug: string;
};

export type StorageAdapterCollections<TOptions = unknown> = Partial<
  Record<string, TOptions | true | false>
>;

/** A storage adapter for the root `storage` key, made by a `@frogbotai/storage-*` factory. */
export type StorageAdapter = {
  /** Collections the app listed; `false` keeps a FrogBot upload collection on local disk. */
  collections: StorageAdapterCollections;
  /** Builds Payload's adapter; `builtIns` are FrogBot's upload collections it also serves. */
  init: (builtIns: string[]) => PayloadStorageAdapter;
};
