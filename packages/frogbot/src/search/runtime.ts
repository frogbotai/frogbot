import type { Config, Payload } from 'payload';

import type { SearchAdapter, SearchCapability } from '../database/types.js';
import { SearchCapabilityError } from './errors.js';
import type { SearchCollection, SearchIndexDescriptor, SearchMode } from './types.js';

const searchAdapters = new WeakMap<Payload['db'], SearchAdapter>();

const searchModes = ['lexical', 'vector', 'hybrid'] as const;

export function getSearchAdapter(db: Payload['db']): SearchAdapter | undefined {
  return searchAdapters.get(db);
}

export function assertSearchCapability({
  adapter,
  collection,
  db,
  index,
  mode,
}: {
  adapter: SearchAdapter | undefined;
  collection: string;
  db: Payload['db'];
  index: SearchIndexDescriptor;
  mode: SearchMode;
}): void {
  const capability: SearchCapability = adapter
    ? adapter.capabilities({ collection, db, index })[mode]
    : {
        unsupported: 'not-implemented',
        detail: 'The database adapter has no search implementation.',
      };

  if (capability === 'supported') return;

  if (!capability || typeof capability !== 'object' || !capability.unsupported) {
    throw new SearchCapabilityError(
      collection,
      index.name,
      mode,
      'not-implemented',
      'The adapter did not declare this mode.',
    );
  }

  throw new SearchCapabilityError(
    collection,
    index.name,
    mode,
    capability.unsupported,
    capability.detail,
  );
}

export function withSearchRuntime({
  adapter,
  collections,
  search,
}: {
  adapter: Config['db'];
  collections: SearchCollection[];
  search?: SearchAdapter;
}): Config['db'] {
  return {
    ...adapter,
    init(args) {
      const db = adapter.init(args);

      if (search) searchAdapters.set(db, search);

      if (!collections.length) return db;

      for (const { slug, search: indexes } of collections) {
        for (const index of Object.values(indexes)) {
          for (const mode of searchModes) {
            if (!index[mode]) continue;

            assertSearchCapability({ adapter: search, collection: slug, db, index, mode });
          }
        }
      }

      search?.buildSchema?.({ collections, db });

      return db;
    },
  };
}
