import type { CollectionConfig, Plugin } from 'frogbot';

export type NotesPluginOptions = {
  collection?: Partial<Omit<CollectionConfig, 'slug'>>;
  collectionSlug?: string;
};

export function createNotesCollection(options: NotesPluginOptions = {}): CollectionConfig {
  const collectionSlug = options.collectionSlug ?? 'notes';

  if (!collectionSlug) {
    throw new Error('[plugin-notes] collectionSlug is required.');
  }

  return {
    fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'body', type: 'textarea' },
    ],
    ...options.collection,
    slug: collectionSlug,
  };
}

export function notesPlugin(options: NotesPluginOptions = {}): Plugin {
  const notes = createNotesCollection(options);

  return (config) => {
    if (config.collections.some(({ slug }) => slug === notes.slug)) {
      throw new Error(`[plugin-notes] Collection slug '${notes.slug}' already exists.`);
    }

    return {
      ...config,
      collections: [...config.collections, notes],
    };
  };
}
