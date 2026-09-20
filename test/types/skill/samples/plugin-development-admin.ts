import type { CollectionView, Plugin } from 'frogbot';

export const NOTES_PANEL = '@frogbotai/plugin-notes/client#NotesPanel';

export const notesNavigationPlugin: Plugin = (config) => ({
  ...config,
  admin: {
    ...config.admin,
    components: {
      ...config.admin?.components,
      beforeNavLinks: [
        ...(config.admin?.components?.beforeNavLinks ?? []),
        '@frogbotai/plugin-notes/client#NotesPanel',
      ],
    },
  },
});

export const notesListPlugin: Plugin = (config) => {
  const collections = config.collections.map((collection) => {
    if (collection.slug !== 'notes') {
      return collection;
    }

    const views: CollectionView[] = collection.admin?.views ?? [{ type: 'list' }];

    return {
      ...collection,
      admin: {
        ...collection.admin,
        views: views.map((view) => {
          if (view.type !== 'list') {
            return view;
          }

          return {
            ...view,
            components: {
              ...view.components,
              beforeTable: [
                '@frogbotai/plugin-notes/client#NotesPanel',
                ...(view.components?.beforeTable ?? []),
              ],
            },
          };
        }),
      },
    };
  });

  return { ...config, collections };
};
