import { definePlugin } from 'frogbot';

export type KeyNotesPluginOptions = {
  fieldName?: string;
};

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-key-notes': KeyNotesPluginOptions | undefined;
  }
}

export const keyNotesPlugin = definePlugin<KeyNotesPluginOptions | undefined>({
  slug: 'plugin-key-notes',
  order: 10,
  plugin: ({ config, options, plugins }) => {
    const keys = plugins['plugin-api-keys']?.options?.collectionSlug;

    return {
      ...config,
      collections: config.collections.map((collection) =>
        collection.slug === keys
          ? {
              ...collection,
              fields: [
                ...collection.fields,
                { name: options?.fieldName ?? 'notes', type: 'textarea' },
              ],
            }
          : collection,
      ),
    };
  },
});
