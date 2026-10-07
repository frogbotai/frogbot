import type { Plugin as PayloadPlugin } from 'payload';

import type { FrogBotConfig } from '../config/types.js';
import type { Plugin } from '../plugin.js';
import { wrapPayloadPlugin } from '../seams/config.js';
import type { StorageAdapterCollections, StorageAdapterRegistration } from './types.js';

type PayloadStorageOptions = {
  collections: Partial<Record<string, unknown>>;
};

type PayloadStorageCollectionOptions<TOptions extends PayloadStorageOptions> = Exclude<
  NonNullable<TOptions['collections'][string]>,
  true
>;

export type StorageAdapterOptions<TOptions extends PayloadStorageOptions> = Omit<
  TOptions,
  'collections'
> & {
  collections?: StorageAdapterCollections<PayloadStorageCollectionOptions<TOptions>>;
};

type ResolvedStorageOptions<TOptions extends PayloadStorageOptions> = Omit<
  StorageAdapterOptions<TOptions>,
  'collections'
> & {
  collections: Record<string, PayloadStorageCollectionOptions<TOptions> | true>;
};

export type StorageAdapterProps<TOptions extends PayloadStorageOptions> = {
  options: StorageAdapterOptions<TOptions>;
  plugin: (options: ResolvedStorageOptions<TOptions>) => PayloadPlugin;
};

export type ApplyStorageAdaptersProps = {
  config: FrogBotConfig;
  builtInSlugs: string[];
};

export function storageAdapter<TOptions extends PayloadStorageOptions>({
  options,
  plugin,
}: StorageAdapterProps<TOptions>): Plugin {
  const { collections = {}, ...rest } = options;

  const registration: StorageAdapterRegistration = {
    collections,
    plugin: (builtIns) =>
      plugin({
        ...rest,
        collections: {
          ...Object.fromEntries(builtIns.map((slug) => [slug, true] as const)),
          ...listedCollections(collections),
        },
      }),
  };

  return (config) => ({ ...config, _storage: [...(config._storage ?? []), registration] });
}

function isListed(options: unknown): boolean {
  return options !== false && options !== undefined;
}

function listedCollections<T>(collections: StorageAdapterCollections<T>): Record<string, T | true> {
  const listed: Record<string, T | true> = {};

  for (const [slug, options] of Object.entries(collections)) {
    if (options !== false && options !== undefined) listed[slug] = options;
  }

  return listed;
}

export function applyStorageAdapters({
  config,
  builtInSlugs,
}: ApplyStorageAdaptersProps): FrogBotConfig {
  const { _storage: adapters = [], ...rest } = config;
  const listed = new Set<string>();

  for (const { collections } of adapters) {
    for (const [slug, options] of Object.entries(collections)) {
      if (!isListed(options)) continue;

      if (listed.has(slug)) {
        throw new Error(
          `[frogbot] Collection '${slug}' is listed in more than one storage adapter. List it in exactly one.`,
        );
      }

      listed.add(slug);
    }
  }

  return adapters.reduce<FrogBotConfig>((current, { collections, plugin }, index) => {
    const builtIns =
      index === 0
        ? builtInSlugs.filter((slug) => !listed.has(slug) && collections[slug] !== false)
        : [];

    const next = wrapPayloadPlugin(plugin(builtIns))(current);

    if (next instanceof Promise) {
      throw new Error('[frogbot] Storage adapters must configure collections synchronously.');
    }

    return next;
  }, rest);
}
