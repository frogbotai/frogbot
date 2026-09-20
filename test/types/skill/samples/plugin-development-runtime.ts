import type { AfterChangeHook, CollectionConfig, Endpoint, Plugin } from 'frogbot';

import { createNotesCollection } from './plugin-development.js';
import { withNotesAfterChange } from './plugin-development-hooks.js';

type NotesRuntimeOptions = {
  disabled?: boolean;
  notesAfterChange: AfterChangeHook;
  notesEndpoint: Endpoint;
};

function addNotesSchema(collections: CollectionConfig[]): CollectionConfig[] {
  if (collections.some(({ slug }) => slug === 'notes')) {
    throw new Error("[plugin-notes] Collection slug 'notes' already exists.");
  }

  return [...collections, createNotesCollection()];
}

export function notesRuntimePlugin(options: NotesRuntimeOptions): Plugin {
  const { notesAfterChange, notesEndpoint } = options;
  const addNotesHooks = (collections: CollectionConfig[]): CollectionConfig[] =>
    collections.map((collection) =>
      collection.slug === 'notes'
        ? withNotesAfterChange({ collection, notesAfterChange })
        : collection,
    );

  return (config) => {
    const collections = addNotesSchema(config.collections);

    if (options.disabled) {
      return {
        ...config,
        collections,
      };
    }

    return {
      ...config,
      collections: addNotesHooks(collections),
      endpoints: [...(config.endpoints ?? []), notesEndpoint],
    };
  };
}
