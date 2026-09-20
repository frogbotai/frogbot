import type { AfterChangeHook, CollectionConfig } from 'frogbot';

export function withNotesAfterChange({
  collection,
  notesAfterChange,
}: {
  collection: CollectionConfig;
  notesAfterChange: AfterChangeHook;
}): CollectionConfig {
  return {
    ...collection,
    hooks: {
      ...collection.hooks,
      afterChange: [notesAfterChange, ...(collection.hooks?.afterChange ?? [])],
    },
  };
}
