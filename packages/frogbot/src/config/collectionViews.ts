import type { PayloadComponent } from 'payload';

import type { CollectionView, CollectionViewMetadata } from '../admin/views/types.js';
import type { CollectionConfig } from '../collections/config/types.js';
import type { Field } from '../fields/config/types.js';

const DEFAULT_VIEW: CollectionView = { type: 'list' };
const GROUP_BY_FIELD_TYPES: Field['type'][] = [
  'text',
  'textarea',
  'number',
  'select',
  'relationship',
  'date',
  'checkbox',
  'radio',
  'email',
  'upload',
];

function resolveGroupByField(fields: unknown[], path: string): Field | undefined {
  const [name, ...rest] = path.replace(/^-/, '').split('.');
  const field = fields.find(
    (candidate): candidate is Field =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'name' in candidate &&
      candidate.name === name,
  );
  if (!field) return undefined;
  if (rest.length === 0) return GROUP_BY_FIELD_TYPES.includes(field.type) ? field : undefined;
  return 'fields' in field && Array.isArray(field.fields)
    ? resolveGroupByField(field.fields, rest.join('.'))
    : undefined;
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function labelFor(type: CollectionView['type']): string {
  return type[0].toUpperCase() + type.slice(1);
}

export function compileCollectionViews({
  collection,
  onRuntimeViews,
}: {
  collection: CollectionConfig;
  onRuntimeViews?: (views: CollectionView[]) => void;
}): CollectionConfig['admin'] {
  const source = collection.admin;
  const configured = source?.views ?? [DEFAULT_VIEW];
  if (configured.length === 0) {
    throw new Error(`[frogbot] Collection "${collection.slug}" admin.views must not be empty.`);
  }

  const slugs = new Set<string>();
  const views = configured.map((view) => {
    const slug = normalizeSlug(view.slug ?? view.type);
    if (!slug) {
      throw new Error(`[frogbot] Collection "${collection.slug}" has a view with an invalid slug.`);
    }
    if (slugs.has(slug)) {
      throw new Error(
        `[frogbot] Collection "${collection.slug}" has duplicate normalized view slug "${slug}".`,
      );
    }
    slugs.add(slug);
    return { ...view, slug } as CollectionView;
  });

  const fullPage = views.find((view) => view.type === 'custom' && view.shell === false);
  if (fullPage && views.length !== 1) {
    throw new Error(
      `[frogbot] Collection "${collection.slug}" custom views with shell: false must be the sole view.`,
    );
  }
  for (const view of views) {
    if (
      view.type === 'board' &&
      view.groupBy &&
      !resolveGroupByField(collection.fields, view.groupBy)
    ) {
      throw new Error(
        `[frogbot] Collection "${collection.slug}" board view "${view.slug}" has an unsupported groupBy field "${view.groupBy}".`,
      );
    }
  }
  const listViews = views.filter((view) => view.type === 'list');
  if (listViews.length > 1 || (listViews.length === 1 && views[0]?.type !== 'list')) {
    throw new Error(
      `[frogbot] Collection "${collection.slug}" supports only one list view and it must be first.`,
    );
  }
  onRuntimeViews?.(views);

  const { components: authoredComponents, views: _views, ...adminSource } = source ?? {};
  const { edit, ...componentSource } = authoredComponents ?? {};
  const runtimeViews: Record<string, unknown> = {};
  const metadata: CollectionViewMetadata[] = [];

  for (const view of views) {
    const path = view === views[0] ? '' : `/${view.slug}`;
    const { access: _access, components, filter: _filter, ...clientView } = view;
    const { component: _component, ...safeView } = clientView as typeof clientView & {
      component?: PayloadComponent;
    };
    metadata.push({
      ...safeView,
      label: view.label ?? labelFor(view.type),
      path,
      slug: view.slug as string,
    } as CollectionViewMetadata);

    if (view.type === 'board') {
      runtimeViews[view === views[0] ? 'list' : (view.slug as string)] = {
        Component: '@frogbotai/next/views#BoardView',
        ...(view === views[0] ? {} : { exact: true, path }),
      };
    } else if (view.type === 'custom') {
      runtimeViews[view === views[0] ? 'list' : (view.slug as string)] = {
        Component: '@frogbotai/next/views#CustomCollectionView',
        ...(view === views[0] ? {} : { exact: true, path }),
      };
    } else if (view === views[0] && components?.actions) {
      runtimeViews.list = { actions: components?.actions };
    }
  }

  const list = views.find((view) => view.type === 'list');
  const listComponents = list?.components;
  const hasViewSwitcher = views.length > 1;
  const components = {
    ...componentSource,
    ...(hasViewSwitcher ? { Description: '@frogbotai/next/views#CollectionViewSwitcher' } : {}),
    ...(listComponents
      ? {
          afterList: listComponents.afterView,
          afterListTable: listComponents.afterTable,
          beforeList: listComponents.beforeView,
          beforeListTable: listComponents.beforeTable,
          listMenuItems: listComponents.menuItems,
        }
      : {}),
    ...(edit
      ? {
          edit: Object.fromEntries(Object.entries(edit).filter(([key]) => key !== 'views')),
        }
      : {}),
    views: {
      ...runtimeViews,
      ...(edit?.views ? { edit: edit.views } : {}),
    },
  };

  return {
    ...adminSource,
    ...(list?.defaultFields ? { defaultColumns: list.defaultFields } : {}),
    ...(list?.defaultSort ? { defaultSort: list.defaultSort } : {}),
    ...(list?.filter ? { baseFilter: list.filter } : {}),
    ...(views.some((view) => view.type === 'board') ? { groupBy: true } : {}),
    ...(list?.pagination ? { pagination: list.pagination } : {}),
    ...(list?.searchableFields ? { listSearchableFields: list.searchableFields } : {}),
    components,
    custom: {
      ...adminSource.custom,
      frogbot: {
        ...((adminSource.custom?.frogbot as Record<string, unknown> | undefined) ?? {}),
        ...(hasViewSwitcher && componentSource.Description
          ? { descriptionComponent: componentSource.Description }
          : {}),
        views: metadata,
      },
    },
  } as CollectionConfig['admin'];
}
