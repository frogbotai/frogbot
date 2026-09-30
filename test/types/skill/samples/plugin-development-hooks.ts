import type { CollectionAfterChangeHook, CollectionConfig } from 'frogbot';

export function withNotesAfterChange({
  collection,
  notesAfterChange,
}: {
  collection: CollectionConfig;
  notesAfterChange: CollectionAfterChangeHook;
}): CollectionConfig {
  return {
    ...collection,
    hooks: {
      ...collection.hooks,
      afterChange: [notesAfterChange, ...(collection.hooks?.afterChange ?? [])],
    },
  };
}
