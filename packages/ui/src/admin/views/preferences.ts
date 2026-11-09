import type { ColumnPreference } from 'payload';
import { formatAdminURL, transformColumnsToPreferences } from 'payload/shared';

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

/**
 * A stored preference with `patch` applied: keys set to `undefined` are removed, every other
 * stored key is kept.
 */
export function applyPreferencePatch(
  stored: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> =
    stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...stored } : {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }

  return next;
}

const patches = new Map<string, Promise<void>>();

/**
 * Reads a preference fresh and writes it back with `patch` applied, one write per key at a time.
 * Reading first keeps the sort and filters the server saved since the page loaded.
 */
export function patchPreference({
  api,
  key,
  patch,
}: {
  api: string;
  key: string;
  patch: Record<string, unknown>;
}): Promise<void> {
  const url = formatAdminURL({ apiRoute: api, path: `/payload-preferences/${key}` });

  const write = async () => {
    const current = await fetch(url, { credentials: 'include' });
    const stored: unknown = current.ok
      ? ((await current.json()) as { value?: unknown }).value
      : undefined;

    await fetch(url, {
      body: JSON.stringify({ value: applyPreferencePatch(stored, patch) }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  };

  const next = (patches.get(key) ?? Promise.resolve()).then(write, write);

  patches.set(key, next);

  return next;
}
