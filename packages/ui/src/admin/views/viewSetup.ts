import { getPreferences, upsertPreferences } from '@payloadcms/ui/utilities/upsertPreferences';
import type { ListQuery, PayloadRequest } from 'payload';

import { getViewPreferenceKey } from './preferences.js';

/** The query keys a view saves per user: columns, group, page size, sort and filters. */
export const VIEW_SETUP_KEYS = ['columns', 'groupBy', 'limit', 'sort', 'where'] as const;

type SetupKey = (typeof VIEW_SETUP_KEYS)[number];

export type ViewSetup = Partial<Record<SetupKey, unknown>>;

/** A stored view preference: the setup plus whatever else the view keeps, such as hidden columns. */
export type StoredViewPreference = Record<string, unknown>;

/** Whether the URL sets none of the setup keys, so the saved setup applies. */
export function isFreshQuery(query: Record<string, unknown> | undefined): boolean {
  return VIEW_SETUP_KEYS.every((key) => query?.[key] === undefined);
}

export function pickViewSetup(value: Record<string, unknown> | undefined): ViewSetup {
  return Object.fromEntries(
    VIEW_SETUP_KEYS.filter((key) => value?.[key] !== undefined).map((key) => [key, value?.[key]]),
  );
}

/**
 * Merges a URL's setup into a stored view preference. Keys the URL leaves out are kept, except
 * `where`: a URL with other setup keys and no filters means the filters were cleared.
 */
export function mergeViewSetup(
  existing: StoredViewPreference | undefined,
  incoming: ViewSetup,
): StoredViewPreference {
  const { where: _where, ...rest } = existing ?? {};

  return { ...rest, ...incoming };
}

export async function readViewPreference(
  req: PayloadRequest,
  key: string,
): Promise<StoredViewPreference | undefined> {
  if (!req.user) return undefined;
  const doc = await getPreferences<StoredViewPreference>(
    key,
    req.payload,
    req.user.id,
    req.user.collection,
  );

  return doc?.value && typeof doc.value === 'object' ? doc.value : undefined;
}

/**
 * Reads a view's saved setup and, when the URL sets part of it, saves the URL's setup first.
 * Returns the stored value and the query the view renders with: the URL's own, or the saved
 * setup when the URL sets none.
 */
export async function resolveViewSetup({
  collectionSlug,
  query,
  req,
  viewSlug,
}: {
  collectionSlug: string;
  query: Record<string, unknown>;
  req: PayloadRequest;
  viewSlug: string;
}): Promise<{
  fresh: boolean;
  preference?: StoredViewPreference;
  preferenceKey: string;
  query: ListQuery;
}> {
  const preferenceKey = getViewPreferenceKey(collectionSlug, viewSlug);
  const fresh = isFreshQuery(query);

  if (fresh || !req.user) {
    const preference = await readViewPreference(req, preferenceKey);

    return {
      fresh,
      preference,
      preferenceKey,
      query: fresh ? { ...pickViewSetup(preference), ...query } : query,
    };
  }

  const preference = await upsertPreferences<StoredViewPreference>({
    customMerge: (existing, incoming) => mergeViewSetup(existing, incoming),
    key: preferenceKey,
    req,
    value: pickViewSetup(query),
  });

  return { fresh, preference, preferenceKey, query };
}
