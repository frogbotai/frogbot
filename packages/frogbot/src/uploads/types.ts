import type { Plugin as PayloadPlugin, UploadConfig as PayloadUploadConfig } from 'payload';

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

export type StorageAdapterRegistration = {
  collections: StorageAdapterCollections;
  /** Builds the Payload plugin; `builtIns` are FrogBot's upload collections it also serves. */
  plugin: (builtIns: string[]) => PayloadPlugin;
};
