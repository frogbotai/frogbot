import type { CollectionConfig as PayloadCollectionConfig, PayloadComponent } from 'payload';

import { validateAdminIcon } from '../admin/icons.js';
import type { CollectionView, CollectionViewMetadata } from '../admin/views/types.js';
import type { CollectionConfig } from '../collections/config/types.js';
import type { Field, TabAsField } from '../fields/config/types.js';
import { flattenTopLevelFields } from '../seams/config.js';

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

function resolveField(fields: Field[], path: string): Field | TabAsField | undefined {
  const [name, ...rest] = path.replace(/^-/, '').split('.');
  const field = flattenTopLevelFields(fields).find(
    (candidate) => 'name' in candidate && candidate.name === name,
  );

  if (!field) return undefined;
  if (rest.length === 0) return field;

  return 'fields' in field ? resolveField(field.fields, rest.join('.')) : undefined;
}

function resolveGroupByField(fields: Field[], path: string): Field | undefined {
  const field = resolveField(fields, path);

  return field && field.type !== 'tab' && GROUP_BY_FIELD_TYPES.includes(field.type)
    ? field
    : undefined;
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The field every board orders by: Payload's `orderable` `_order`. */
export const BOARD_ORDER_FIELD = '_order';

/** Whether a collection has a board view, and so needs Payload's `orderable`. */
export function hasBoardView(collection: CollectionConfig): boolean {
  return (collection.admin?.views ?? [DEFAULT_VIEW]).some((view) => view.type === 'board');
}

function resolveDoneField(fields: Field[], path: string): Field | TabAsField | undefined {
  const [name, ...rest] = path.split('.');
  const field = flattenTopLevelFields(fields).find(
    (candidate) => 'name' in candidate && candidate.name === name,
  );

  if (!field || rest.length === 0) return field;

  return field.type === 'group' || field.type === 'tab'
    ? resolveDoneField(field.fields, rest.join('.'))
    : undefined;
}

function validateUseAsDone(collection: CollectionConfig): void {
  const path = collection.admin?.useAsDone;
  if (path === undefined) return;

  if (resolveDoneField(collection.fields, path)?.type !== 'checkbox') {
    throw new Error(
      `[frogbot] Collection "${collection.slug}" admin.useAsDone "${path}" must name a checkbox field, top level or a dot path into a group.`,
    );
  }
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
}): PayloadCollectionConfig['admin'] {
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

    return { ...view, slug };
  });

  const fullPage = views.find((view) => view.type === 'custom' && view.shell === false);
  if (fullPage && views.length !== 1) {
    throw new Error(
      `[frogbot] Collection "${collection.slug}" custom views with shell: false must be the sole view.`,
    );
  }

  if (fullPage) {
    const shellOnly = (['beforeView', 'afterView', 'menuItems', 'toolbar'] as const).filter(
      (key) => fullPage.components?.[key] !== undefined,
    );

    if (shellOnly.length) {
      throw new Error(
        `[frogbot] Collection "${collection.slug}" view "${fullPage.slug}" sets shell: false, so ${shellOnly.join(', ')} would never render. Remove them or drop shell: false.`,
      );
    }
  }

  validateUseAsDone(collection);

  for (const view of views) {
    validateAdminIcon(view.icon);

    if (typeof view.filter === 'function') {
      throw new Error(
        `[frogbot] Collection "${collection.slug}" view "${view.slug}" has a function filter. A view's filter is a plain Where object.`,
      );
    }

    if (
      view.type === 'board' &&
      view.groupBy &&
      !resolveGroupByField(collection.fields, view.groupBy)
    ) {
      throw new Error(
        `[frogbot] Collection "${collection.slug}" board view "${view.slug}" has an unsupported groupBy field "${view.groupBy}".`,
      );
    }

    if (view.type === 'calendar') {
      for (const path of [view.start, view.end].filter((value): value is string =>
        Boolean(value),
      )) {
        if (resolveField(collection.fields, path)?.type !== 'date') {
          throw new Error(
            `[frogbot] Collection "${collection.slug}" calendar view "${view.slug}" has a non-date field "${path}".`,
          );
        }
      }

      if (view.color) {
        const colorField = resolveField(collection.fields, view.color);
        if (colorField?.type !== 'select' && colorField?.type !== 'radio') {
          throw new Error(
            `[frogbot] Collection "${collection.slug}" calendar view "${view.slug}" has an unsupported color field "${view.color}".`,
          );
        }
      }
    }
  }

  const listViews = views.filter((view) => view.type === 'list');
  if (listViews.length > 1 || (listViews.length === 1 && views[0]?.type !== 'list')) {
    throw new Error(
      `[frogbot] Collection "${collection.slug}" supports only one list view and it must be first.`,
    );
  }

  onRuntimeViews?.(views);

  const { components: authoredComponents, useAsDone, views: _views, ...adminSource } = source ?? {};

  const { edit, ...componentSource } = authoredComponents ?? {};
  const runtimeViews: Record<string, unknown> = {};
  const metadata: CollectionViewMetadata[] = [];

  for (const view of views) {
    const isDefault = view === views[0];
    const key = isDefault ? 'list' : view.slug;
    const path = isDefault ? '' : `/${view.slug}`;
    const { access: _access, components, filter: _filter, icon: _icon, ...clientView } = view;
    const { component: _component, ...safeView } = clientView as typeof clientView & {
      component?: PayloadComponent;
    };

    metadata.push({
      ...safeView,
      label: view.label ?? labelFor(view.type),
      ...(view.type === 'board' ? { orderField: BOARD_ORDER_FIELD } : {}),
      path,
      slug: view.slug,
    });

    const actions = isDefault && components?.actions ? { actions: components.actions } : {};

    if (view.type === 'board') {
      runtimeViews[key] = {
        Component: '@frogbotai/ui/admin/rsc#BoardView',
        ...actions,
        ...(isDefault ? {} : { exact: true, path }),
      };
    } else if (view.type === 'calendar') {
      runtimeViews[key] = {
        Component: '@frogbotai/ui/admin/rsc#CalendarView',
        ...actions,
        ...(isDefault ? {} : { exact: true, path }),
      };
    } else if (view.type === 'custom') {
      runtimeViews[key] = {
        Component: '@frogbotai/ui/admin/rsc#CustomCollectionView',
        ...actions,
        ...(isDefault ? {} : { exact: true, path }),
      };
    } else if (view.type === 'list' && isDefault) {
      runtimeViews.list = {
        Component: '@frogbotai/ui/admin/rsc#ListView',
        ...actions,
      };
    }
  }

  const list = views.find((view) => view.type === 'list');
  const listComponents = list?.components;
  const components = {
    ...componentSource,
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
    ...(list?.pagination ? { pagination: list.pagination } : {}),
    ...(list?.searchableFields ? { listSearchableFields: list.searchableFields } : {}),
    components,
    custom: {
      ...adminSource.custom,
      frogbot: {
        ...((adminSource.custom?.frogbot as Record<string, unknown> | undefined) ?? {}),
        ...(useAsDone ? { useAsDone } : {}),
        views: metadata,
      },
    },
  } as PayloadCollectionConfig['admin'];
}
