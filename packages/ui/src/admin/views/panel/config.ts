import type {
  ClientCollectionConfig,
  ClientField,
  PayloadComponent,
  SanitizedCollectionConfig,
} from 'payload';
import { fieldIsSidebar } from 'payload/shared';

/** The record panel's width bounds and default, in px; core validates `admin.panel.width` with them. */
export const PANEL_WIDTH = { default: 560, max: 960, min: 400 } as const;

/** The panel's settings as the client config carries them: off, or properties and width. */
export type PanelSettings = false | { properties?: string[]; width: number };

/** The panel components a collection sets in `admin.components.panel`. */
export type PanelComponents = {
  actions?: PayloadComponent[];
  afterFields?: PayloadComponent[];
  beforeFields?: PayloadComponent[];
  Component?: PayloadComponent;
  Header?: PayloadComponent;
};

export function getPanelSettings(collectionConfig: ClientCollectionConfig): PanelSettings {
  const frogbot = collectionConfig.admin?.custom?.frogbot as { panel?: PanelSettings } | undefined;
  const panel = frogbot?.panel;

  if (panel === false) return false;

  return { properties: panel?.properties, width: panel?.width ?? PANEL_WIDTH.default };
}

export function getPanelComponents(collection: SanitizedCollectionConfig): PanelComponents {
  return (collection.custom?.frogbot as { panel?: PanelComponents } | undefined)?.panel ?? {};
}

/** The preference key that holds a user's panel width for a collection. */
export function getPanelPreferenceKey(collectionSlug: string): string {
  return `collection-${collectionSlug}-panel`;
}

export function clampPanelWidth(width: number, viewport = Infinity): number {
  return Math.round(Math.min(PANEL_WIDTH.max, viewport, Math.max(PANEL_WIDTH.min, width)));
}

type Named = ClientField & { name: string };

function isNamed(field: ClientField): field is Named {
  return 'name' in field && typeof field.name === 'string';
}

function childFields(field: ClientField): ClientField[] | undefined {
  if (
    'fields' in field &&
    (field.type === 'group' || field.type === 'collapsible' || field.type === 'row')
  ) {
    return field.fields;
  }

  return undefined;
}

/**
 * The field a dot path names, with the parent path it renders under: top level, inside a group
 * or named tab, or through unnamed rows, collapsibles, groups and tabs.
 */
export function findPanelField(
  fields: ClientField[],
  path: string,
  parentPath = '',
): { field: ClientField; parentPath: string } | undefined {
  const [name, ...rest] = path.split('.');

  for (const field of fields) {
    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        if ('name' in tab && tab.name) {
          if (tab.name === name && rest.length) {
            const found = findPanelField(tab.fields, rest.join('.'), join(parentPath, tab.name));
            if (found) return found;
          }
        } else {
          const found = findPanelField(tab.fields, path, parentPath);
          if (found) return found;
        }
      }

      continue;
    }

    if (isNamed(field) && field.type !== 'group') {
      if (field.name === name && rest.length === 0) return { field, parentPath };
      continue;
    }

    if (isNamed(field)) {
      if (field.name !== name) continue;
      if (rest.length === 0) return { field, parentPath };

      return findPanelField(field.fields, rest.join('.'), join(parentPath, field.name));
    }

    const children = childFields(field);

    if (children) {
      const found = findPanelField(children, path, parentPath);
      if (found) return found;
    }
  }

  return undefined;
}

function join(parent: string, name: string): string {
  return parent ? `${parent}.${name}` : name;
}

/**
 * The fields with the given paths left out, wherever they sit, so the panel's form doesn't render
 * the title and the property list a second time.
 */
export function omitPanelFields(
  fields: ClientField[],
  paths: Set<string>,
  parentPath = '',
): ClientField[] {
  return fields.flatMap((field): ClientField[] => {
    if (field.type === 'tabs') {
      return [
        {
          ...field,
          tabs: field.tabs.map((tab) => ({
            ...tab,
            fields: omitPanelFields(
              tab.fields,
              paths,
              'name' in tab && tab.name ? join(parentPath, tab.name) : parentPath,
            ),
          })),
        },
      ];
    }

    if (isNamed(field)) {
      const path = join(parentPath, field.name);
      if (paths.has(path)) return [];

      return field.type === 'group'
        ? [{ ...field, fields: omitPanelFields(field.fields, paths, path) }]
        : [field];
    }

    const children = childFields(field);

    return children
      ? [{ ...field, fields: omitPanelFields(children, paths, parentPath) }]
      : [field];
  });
}

/** The panel's property paths: the configured ones, or the top-level sidebar fields. */
export function resolvePropertyPaths(
  collectionConfig: ClientCollectionConfig,
  settings: Exclude<PanelSettings, false>,
): string[] {
  if (settings.properties) return [...new Set(settings.properties)];

  return collectionConfig.fields
    .filter((field) => fieldIsSidebar(field) && isNamed(field))
    .map((field) => (field as Named).name);
}

/** The title field the panel edits in place: `useAsTitle`, when it's a text-like field. */
export function resolveTitlePath(collectionConfig: ClientCollectionConfig): string | undefined {
  const path = collectionConfig.admin?.useAsTitle;
  if (!path || path === 'id') return undefined;
  const found = findPanelField(collectionConfig.fields, path);

  return found && ['email', 'text', 'textarea'].includes(found.field.type) ? path : undefined;
}
