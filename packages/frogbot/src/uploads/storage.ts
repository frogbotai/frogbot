import type { Plugin as PayloadPlugin } from 'payload';

import type { FrogBotConfig } from '../config/types.js';
import type { Plugin } from '../plugin.js';
import type { PayloadConfig } from '../types/payload.js';
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

export type StorageAdapterProps<TOptions extends PayloadStorageOptions> = {
  options: StorageAdapterOptions<TOptions>;
  plugin: (options: TOptions) => PayloadPlugin;
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
    plugin: (resolved) => plugin({ ...rest, collections: resolved } as unknown as TOptions),
  };

  return (config) => ({ ...config, _storage: [...(config._storage ?? []), registration] });
}

function isListed(options: unknown): boolean {
  return options !== false && options !== undefined;
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

    const resolved = Object.fromEntries([
      ...builtIns.map((slug) => [slug, true]),
      ...Object.entries(collections).filter(([, options]) => isListed(options)),
    ]);

    const next = plugin(resolved)(current as unknown as PayloadConfig);

    if (next instanceof Promise) {
      throw new Error('[frogbot] Storage adapters must configure collections synchronously.');
    }

    return next as unknown as FrogBotConfig;
  }, rest);
}
