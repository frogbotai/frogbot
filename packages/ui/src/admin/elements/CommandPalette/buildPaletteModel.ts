import { getTranslation } from '@payloadcms/translations';
import type { SearchIndexDescriptors } from 'frogbot';
import type { Field, SanitizedCollectionConfig } from 'payload';
import { formatAdminURL } from 'payload/shared';

import {
  buildCollectionGroups,
  buildNavModel,
  type BuildNavModelProps,
} from '../Nav/buildNavModel.js';

export type PaletteRow = {
  createPath?: string;
  group: string | null;
  label: string;
  path: string;
};

export type PaletteCollection = {
  index?: string;
  label: string;
  searchFields: string[];
  slug: string;
  titleField: string;
};

export type PaletteModel = {
  collections: PaletteCollection[];
  rows: PaletteRow[];
};

function joinPath(parent: string, name: string): string {
  return name ? [parent, name].filter(Boolean).join('.') : parent;
}

function isGuarded(item: { access?: { read?: unknown } }): boolean {
  return Boolean(item.access?.read);
}

/** Lists the field paths that have, or sit under, field-level read access, as core's search does. */
export function getReadGuardedPaths(fields: readonly Field[]): Set<string> {
  const guarded = new Set<string>();

  function visit(items: readonly Field[], parentPath: string, parentGuarded: boolean): void {
    for (const field of items) {
      const name = 'name' in field && typeof field.name === 'string' ? field.name : '';
      const path = joinPath(parentPath, name);
      const readGuarded = parentGuarded || ('access' in field && isGuarded(field));

      if (name && readGuarded) guarded.add(path);

      if (field.type === 'tabs') {
        for (const tab of field.tabs) {
          const tabName = 'name' in tab && typeof tab.name === 'string' ? tab.name : '';

          visit(
            tab.fields,
            joinPath(path, tabName),
            readGuarded || ('access' in tab && isGuarded(tab)),
          );
        }
      } else if (field.type === 'blocks') {
        for (const block of field.blocks) {
          if (typeof block !== 'string') visit(block.fields, path, readGuarded);
        }
      } else if ('fields' in field && Array.isArray(field.fields)) {
        visit(field.fields, path, readGuarded);
      }
    }
  }

  visit(fields, '', false);

  return guarded;
}

/** Picks the first index with a lexical component whose ranked fields have no field-level read access. */
export function pickLexicalIndex(collection: SanitizedCollectionConfig): string | undefined {
  const indexes = (collection.custom?.frogbot as { search?: SearchIndexDescriptors } | undefined)
    ?.search;

  if (!indexes) return undefined;

  const guarded = getReadGuardedPaths(collection.fields);

  return Object.keys(indexes).find((name) => {
    const lexical = indexes[name]?.lexical;

    return lexical && !lexical.fields.some(({ path }) => guarded.has(path));
  });
}

/** Builds the command palette's "go to" rows and searchable collections, in sidebar order. */
export function buildPaletteModel(props: BuildNavModelProps): PaletteModel {
  const { config, i18n, permissions, visibleEntities } = props;
  const adminRoute = config.routes.admin;
  const collectionGroup = i18n.t('general:collections');
  const { groups, items } = buildCollectionGroups(props);

  const entries = [
    ...buildNavModel(props).items.map(({ label, path }) => ({ group: null, label, path })),
    ...items.map(({ label, path }) => ({ group: collectionGroup, label, path })),
    ...groups.flatMap(({ items: groupItems, label: group }) =>
      groupItems.map(({ label, path }) => ({ group, label, path })),
    ),
  ];

  const collectionByPath = new Map(
    config.collections.map((collection) => [
      formatAdminURL({ adminRoute, path: `/collections/${collection.slug}` }),
      collection,
    ]),
  );

  const seen = new Set<string>();
  const rows: PaletteRow[] = [];
  const collections: PaletteCollection[] = [];

  for (const entry of entries) {
    if (seen.has(entry.path)) continue;

    seen.add(entry.path);

    const collection = collectionByPath.get(entry.path);
    const collectionPermissions = collection && permissions.collections?.[collection.slug];

    rows.push(
      collection && collectionPermissions?.create
        ? {
            ...entry,
            createPath: formatAdminURL({
              adminRoute,
              path: `/collections/${collection.slug}/create`,
            }),
          }
        : entry,
    );

    if (
      !collection ||
      !collectionPermissions?.read ||
      !visibleEntities.collections.includes(collection.slug)
    ) {
      continue;
    }

    const titleField = collection.admin.useAsTitle || 'id';
    const label = getTranslation(collection.labels.plural, i18n);
    const index = pickLexicalIndex(collection);

    collections.push({
      ...(index ? { index } : {}),
      label: typeof label === 'string' ? label : collection.slug,
      searchFields: collection.admin.listSearchableFields?.length
        ? collection.admin.listSearchableFields
        : [titleField],
      slug: collection.slug,
      titleField,
    });
  }

  return { collections, rows };
}
