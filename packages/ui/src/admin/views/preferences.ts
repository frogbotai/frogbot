import type { ColumnPreference } from 'payload';
import { transformColumnsToPreferences } from 'payload/shared';

export type ViewPreferenceValue = Record<string, unknown> & {
  columns?: ColumnPreference[];
};

export type ViewColumnsSource = ColumnPreference[] | string | string[] | undefined;

/** The preference that remembers the view a user last chose for a collection. */
export function getLastViewPreferenceKey(collectionSlug: string): string {
  return `frogbot:collection-view:${collectionSlug}`;
}

export function getViewPreferenceKey(collectionSlug: string, viewSlug: string): string {
  return `collection-${collectionSlug}-view-${viewSlug}`;
}

/**
 * The preference that keeps a view's collapsed groups, apart from its setup so collapsing a group
 * never writes back a stale sort, filter or grouping.
 */
export function getGroupsPreferenceKey(collectionSlug: string, viewSlug: string): string {
  return `${getViewPreferenceKey(collectionSlug, viewSlug)}:groups`;
}

export function getViewPreferenceUpdate<T extends ViewPreferenceValue>(
  collectionSlug: string,
  viewSlug: string,
  value: T,
): [string, T, true] {
  return [getViewPreferenceKey(collectionSlug, viewSlug), value, true];
}

export function resolveViewColumnPreferences({
  defaultFields,
  preferenceColumns,
  queryColumns,
  useAsTitle,
}: {
  defaultFields?: string[];
  preferenceColumns?: ViewColumnsSource;
  queryColumns?: ViewColumnsSource;
  useAsTitle?: string;
}): ColumnPreference[] {
  const fromQuery = transformColumnsToPreferences(queryColumns);
  if (fromQuery?.length) return fromQuery;
  const fromPreference = transformColumnsToPreferences(preferenceColumns);
  if (fromPreference?.length) return fromPreference;
  const seed = defaultFields?.length ? defaultFields : [useAsTitle ?? 'id'];

  return seed.map((accessor) => ({ accessor, active: true }));
}

export function getViewCardColumns<T extends { accessor: string; active: boolean }>(
  columns: T[] | undefined,
  useAsTitle?: string,
): T[] {
  return (columns ?? []).filter(
    (column) => column.active && Boolean(column.accessor) && column.accessor !== useAsTitle,
  );
}
