import type { StorageAdapter as PayloadStorageAdapter } from 'payload';

import type { StorageAdapter, StorageAdapterCollections } from './types.js';

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
  adapter: (options: ResolvedStorageOptions<TOptions>) => PayloadStorageAdapter;
};

export type ResolveStorageAdaptersProps = {
  adapters: StorageAdapter[];
  builtInSlugs: string[];
};

export function storageAdapter<TOptions extends PayloadStorageOptions>({
  options,
  adapter,
}: StorageAdapterProps<TOptions>): StorageAdapter {
  const { collections = {}, ...rest } = options;

  return {
    collections,
    init: (builtIns) =>
      adapter({
        ...rest,
        collections: {
          ...Object.fromEntries(builtIns.map((slug) => [slug, true] as const)),
          ...listedCollections(collections),
        },
      }),
  };
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

/** Payload's `storage` adapters, with FrogBot's upload collections routed to the first one. */
export function resolveStorageAdapters({
  adapters,
  builtInSlugs,
}: ResolveStorageAdaptersProps): PayloadStorageAdapter[] {
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

  return adapters.map(({ collections, init }, index) =>
    init(
      index === 0
        ? builtInSlugs.filter((slug) => !listed.has(slug) && collections[slug] !== false)
        : [],
    ),
  );
}
