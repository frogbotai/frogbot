import {
  type CollectionConfig as PayloadCollectionConfig,
  InvalidConfiguration,
  type PayloadComponent,
} from 'payload';

import { validateAdminIcon } from '../admin/icons.js';
import { SUMMARY_OPERATIONS, type SummaryKind } from '../admin/views/summary.js';
import type { CollectionView, CollectionViewMetadata } from '../admin/views/types.js';
import type { CollectionConfig } from '../collections/config/types.js';
import type { Field, TabAsField } from '../fields/config/types.js';
import { flattenTopLevelFields } from '../seams/config.js';

const DEFAULT_VIEW: CollectionView = { type: 'list' };
/** The field types a list or board view can group by: Payload's groupable types. */
export const GROUP_BY_FIELD_TYPES: readonly Field['type'][] = [
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

  if (!field || field.type === 'tab' || !GROUP_BY_FIELD_TYPES.includes(field.type)) {
    return undefined;
  }

  const polymorphic = 'relationTo' in field && Array.isArray(field.relationTo);
  const virtual = 'virtual' in field && Boolean(field.virtual);

  return polymorphic || virtual ? undefined : field;
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

function resolveFieldPath(fields: Field[], path: string): (Field | TabAsField)[] | undefined {
  const [name, ...rest] = path.split('.');
  const field = flattenTopLevelFields(fields).find(
    (candidate) => 'name' in candidate && candidate.name === name,
  );

  if (!field) return undefined;
  if (rest.length === 0) return [field];
  if (field.type !== 'group' && field.type !== 'tab') return undefined;

  const inner = resolveFieldPath(field.fields, rest.join('.'));

  return inner && [field, ...inner];
}

function resolveDoneField(fields: Field[], path: string): Field | TabAsField | undefined {
  return resolveFieldPath(fields, path)?.at(-1);
}

function validateUseAsDone(collection: CollectionConfig): void {
  const path: unknown = collection.admin?.useAsDone;
  if (path === undefined) return;

  if (typeof path !== 'string' || resolveDoneField(collection.fields, path)?.type !== 'checkbox') {
    throw new Error(
      `[frogbot] Collection "${collection.slug}" admin.useAsDone "${path}" must name a checkbox field, top level or a dot path into a group.`,
    );
  }
}

function validateViewThumbnail(
  collection: CollectionConfig,
  view: CollectionView & { slug: string },
) {
  if (view.type !== 'board' && view.type !== 'gallery') return;
  const name: unknown = view.useAsThumbnail;
  if (name === undefined || name === false) return;

  const field =
    typeof name === 'string' && !name.includes('.')
      ? flattenTopLevelFields(collection.fields).find(
          (candidate) => 'name' in candidate && candidate.name === name,
        )
      : undefined;

  if (field?.type !== 'upload') {
    throw new InvalidConfiguration(
      `[frogbot] Collection "${collection.slug}" ${view.type} view "${view.slug}" has useAsThumbnail "${String(name)}", which must name a top-level upload field or be false.`,
    );
  }
}

/** The record panel's width bounds and default, in px. */
export const PANEL_WIDTH = { default: 560, max: 960, min: 400 } as const;

function validatePanel(collection: CollectionConfig): void {
  const panel: unknown = collection.admin?.panel;
  if (panel === undefined || panel === false) return;
  const name = `[frogbot] Collection "${collection.slug}" admin.panel`;

  if (!panel || typeof panel !== 'object' || Array.isArray(panel)) {
    throw new Error(`${name} must be false or an object.`);
  }

  const { properties, width } = panel as { properties?: unknown; width?: unknown };

  if (properties !== undefined) {
    if (!Array.isArray(properties)) {
      throw new Error(`${name}.properties must be an array of field names.`);
    }

    const seen: string[] = [];

    for (const path of properties as unknown[]) {
      const field =
        typeof path === 'string' ? resolveDoneField(collection.fields, path) : undefined;

      if (!field || !('name' in field) || field.type === 'tab') {
        throw new Error(
          `${name}.properties entry "${String(path)}" must name a field, top level or a dot path into a group or named tab.`,
        );
      }

      const entry = path as string;
      const repeated = seen.find(
        (other) =>
          other === entry || entry.startsWith(`${other}.`) || other.startsWith(`${entry}.`),
      );

      if (repeated !== undefined) {
        throw new Error(
          `${name}.properties entry "${entry}" repeats "${repeated}"; each field appears once.`,
        );
      }

      seen.push(entry);
    }
  }

  if (
    width !== undefined &&
    (typeof width !== 'number' ||
      !Number.isFinite(width) ||
      width < PANEL_WIDTH.min ||
      width > PANEL_WIDTH.max)
  ) {
    throw new Error(
      `${name}.width ${String(width)} must be a number from ${PANEL_WIDTH.min} to ${PANEL_WIDTH.max}.`,
    );
  }
}

function getConfigSummaryKind(
  collection: CollectionConfig,
  path: string,
): SummaryKind | 'guarded' | undefined {
  if (path === 'id') return 'other';

  if ((path === 'createdAt' || path === 'updatedAt') && collection.timestamps !== false) {
    return 'date';
  }

  const chain = resolveFieldPath(collection.fields, path);
  const field = chain?.at(-1);

  if (!chain || !field || !('name' in field)) return undefined;

  const isGuarded = chain.some(
    (step) => ('hidden' in step && step.hidden === true) || ('access' in step && step.access?.read),
  );

  if (isGuarded) return 'guarded';

  if ('virtual' in field && field.virtual) return 'other';

  if (field.type === 'number' && !field.hasMany) return 'number';

  return field.type === 'date' ? 'date' : 'other';
}

function validateSummary(collection: CollectionConfig, view: CollectionView & { slug: string }) {
  if (view.type !== 'list' || view.summary === undefined) return;

  const prefix = `[frogbot] Collection "${collection.slug}" list view "${view.slug}" summary`;

  if (!view.summary || typeof view.summary !== 'object' || Array.isArray(view.summary)) {
    throw new Error(`${prefix} must be an object of field paths to operations.`);
  }

  for (const [path, operation] of Object.entries(view.summary)) {
    const kind = getConfigSummaryKind(collection, path);

    if (!kind) throw new Error(`${prefix} names "${path}", which is not a field.`);

    if (kind === 'guarded') {
      throw new Error(
        `${prefix} names "${path}", which is hidden or has its own access.read, so it can't be totaled.`,
      );
    }

    if (!SUMMARY_OPERATIONS[kind].includes(operation)) {
      throw new Error(
        `${prefix} sets "${path}" to "${String(operation)}": a ${kind === 'other' ? 'field that is not a number or date' : `${kind} field`} takes ${SUMMARY_OPERATIONS[kind].join(', ')}.`,
      );
    }
  }
}

function containsFunction(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (!value || typeof value !== 'object') return false;

  return Object.values(value).some(containsFunction);
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
  validatePanel(collection);

  for (const view of views) {
    validateAdminIcon(view.icon);
    validateViewThumbnail(collection, view);
    validateSummary(collection, view);

    if (containsFunction(view.filter)) {
      throw new Error(
        `[frogbot] Collection "${collection.slug}" view "${view.slug}" has a function filter. A view's filter is a plain Where object.`,
      );
    }

    if (
      (view.type === 'board' || view.type === 'list') &&
      view.groupBy &&
      !resolveGroupByField(collection.fields, view.groupBy)
    ) {
      throw new Error(
        `[frogbot] Collection "${collection.slug}" ${view.type} view "${view.slug}" has an unsupported groupBy field "${view.groupBy}".`,
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

  const {
    components: authoredComponents,
    panel,
    useAsDone,
    views: _views,
    ...adminSource
  } = source ?? {};

  const { edit, panel: _panelComponents, ...componentSource } = authoredComponents ?? {};
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
    } else if (view.type === 'gallery') {
      runtimeViews[key] = {
        Component: '@frogbotai/ui/admin/rsc#GalleryView',
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
    ...(list?.filter ? { baseFilter: () => list.filter } : {}),
    ...(list?.pagination ? { pagination: list.pagination } : {}),
    ...(list?.searchableFields ? { listSearchableFields: list.searchableFields } : {}),
    components,
    custom: {
      ...adminSource.custom,
      frogbot: {
        ...((adminSource.custom?.frogbot as Record<string, unknown> | undefined) ?? {}),
        panel:
          panel === false
            ? false
            : {
                ...(panel?.properties ? { properties: panel.properties } : {}),
                width: panel?.width ?? PANEL_WIDTH.default,
              },
        ...(useAsDone ? { useAsDone } : {}),
        views: metadata,
      },
    },
  } as PayloadCollectionConfig['admin'];
}
