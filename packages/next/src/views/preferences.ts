import type { ColumnPreference } from 'payload';
import { transformColumnsToPreferences } from 'payload/shared';

export type ViewPreferenceValue = Record<string, unknown> & {
  columns?: ColumnPreference[];
};

export type ViewColumnsSource = ColumnPreference[] | string | string[] | undefined;

export function getViewPreferenceKey(collectionSlug: string, viewSlug: string): string {
  return `collection-${collectionSlug}-view-${viewSlug}`;
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
