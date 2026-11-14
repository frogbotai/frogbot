import type { ColumnPreference, ServerFunctionClient } from 'payload';
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

/** The FrogBot server function that patches the signed-in user's preference. */
export const PATCH_PREFERENCE = 'frogbot-patch-preference';

/** A preference patch: keys set to `null` or `undefined` are removed, the rest are set. */
export type PreferencePatch = Record<string, unknown>;

export type PatchPreferenceArgs = {
  key: string;
  patch: PreferencePatch;
};

/**
 * A stored preference with `patch` applied: keys set to `null` or `undefined` are removed, every
 * other stored key is kept.
 */
export function applyPreferencePatch(
  stored: unknown,
  patch: PreferencePatch,
): Record<string, unknown> {
  const next: Record<string, unknown> =
    stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...stored } : {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key];
    else next[key] = value;
  }

  return next;
}

const patches = new Map<string, Promise<unknown>>();

/**
 * Sends `patch` to the server, which merges it into the preference stored at that moment, one
 * patch per key at a time. Removed keys travel as `null`.
 */
export function patchPreference({
  key,
  patch,
  serverFunction,
}: PatchPreferenceArgs & { serverFunction: ServerFunctionClient }): Promise<unknown> {
  const args: PatchPreferenceArgs = {
    key,
    patch: Object.fromEntries(Object.entries(patch).map(([name, value]) => [name, value ?? null])),
  };

  const send = () => serverFunction({ name: PATCH_PREFERENCE, args });
  const next = (patches.get(key) ?? Promise.resolve()).then(send, send);

  patches.set(key, next);

  return next;
}
