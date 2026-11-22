import type { CollectionConfig } from '../../collections/config/types.js';
import type { DatabaseAdapter } from '../../database/types.js';

export const MEMORIES_SLUG = 'frogbot-memories';

export const MEMORY_SEARCH_INDEX = 'memory';

/** Whether the database can search memories with an index. Plain MongoDB has no search infrastructure. */
export function canIndexMemories({
  atlasSearch,
  db,
}: {
  atlasSearch: boolean;
  db: Pick<DatabaseAdapter, 'name'>;
}): boolean {
  return db.name !== 'mongoose' || atlasSearch;
}

export function memoriesCollection({
  dimensions,
  indexed,
}: {
  dimensions?: number;
  indexed: boolean;
}): CollectionConfig {
  const vector = indexed && dimensions !== undefined;

  return {
    slug: MEMORIES_SLUG,
    versions: false,
    authorship: false,
    custom: { frogbot: { internal: true } },
    typescript: { interface: 'FrogBotMemory' },
    admin: { hidden: true },
    graphQL: false,
    access: {
      create: () => false,
      read: () => false,
      update: () => false,
      delete: () => false,
    },
    fields: [
      { name: 'bucket', type: 'text', required: true, index: true },
      { name: 'scope', type: 'text', required: true },
      { name: 'key', type: 'text' },
      { name: 'slot', type: 'text', required: true, unique: true },
      { name: 'text', type: 'textarea', required: true },
      { name: 'fingerprint', type: 'text', required: true },
      { name: 'pinned', type: 'checkbox', required: true, defaultValue: false },
      ...(vector ? [{ name: 'embedding', type: 'vector' as const, dimensions }] : []),
    ],
    indexes: [{ fields: ['bucket', 'fingerprint'] }, { fields: ['bucket', 'pinned'] }],
    ...(indexed
      ? {
          search: {
            [MEMORY_SEARCH_INDEX]: {
              lexical: { fields: ['text', 'key'] },
              ...(vector ? { vector: { field: 'embedding' } } : {}),
              filters: { fields: ['bucket'] },
            },
          },
        }
      : {}),
  };
}
