import { COLLECTION_VIEWS } from '../admin/views/registry.js';
import type { CollectionViewDefinition } from '../admin/views/types.js';
import type { CollectionConfig } from '../collections/config/types.js';

export type CollectionView = Pick<CollectionViewDefinition, 'key' | 'label' | 'path'>;

export function compileCollectionViews({
  collection,
  registry = COLLECTION_VIEWS,
}: {
  collection: CollectionConfig;
  registry?: CollectionViewDefinition[];
}): CollectionConfig['admin'] {
  const source = collection.admin;
  const configured = registry.filter(
    ({ key }) => key === 'list' || Object.prototype.hasOwnProperty.call(source ?? {}, key),
  );

  if (configured.length < 2) return source;

  const admin = { ...source } as NonNullable<CollectionConfig['admin']> &
    Record<string, unknown> & { custom?: Record<string, unknown> };
  const components = { ...source?.components };
  const views = { ...components.views } as Record<string, unknown>;

  for (const definition of configured) {
    if (definition.key === 'list') continue;
    delete admin[definition.key];
    if (!views[definition.key] && definition.Component) {
      views[definition.key] = {
        Component: definition.Component,
        exact: true,
        path: definition.path,
      };
    }
  }

  components.views = views as NonNullable<typeof components.views>;
  components.beforeListTable = [
    '@frogbotai/next/client#ViewSwitcher',
    ...(components.beforeListTable ?? []),
  ];
  components.beforeList = ['@frogbotai/next/views#ViewRedirect', ...(components.beforeList ?? [])];
  admin.components = components;
  admin.custom = {
    ...admin.custom,
    frogbot: {
      ...((admin.custom?.frogbot as Record<string, unknown> | undefined) ?? {}),
      views: configured.map(({ key, label, path }) => ({
        key,
        label,
        path: key === 'list' ? path : ((views[key] as { path?: string } | undefined)?.path ?? path),
      })),
    },
  };

  return admin;
}
