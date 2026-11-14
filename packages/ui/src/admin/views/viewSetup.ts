import { getPreferences, upsertPreferences } from '@payloadcms/ui/utilities/upsertPreferences';
import type { ListQuery, PayloadRequest, Where } from 'payload';

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

/** Whether a page size equals the view's default, so it is not a choice worth saving. */
export function isDefaultLimit(limit: unknown, defaultLimit: number | undefined): boolean {
  return defaultLimit !== undefined && limit !== undefined && Number(limit) === defaultLimit;
}

function withoutDefaultLimit(setup: ViewSetup, defaultLimit: number | undefined): ViewSetup {
  if (!isDefaultLimit(setup.limit, defaultLimit)) return setup;
  const { limit: _limit, ...rest } = setup;

  return rest;
}

/**
 * Merges a URL's setup into a stored view preference. Keys the URL leaves out are kept, except
 * `where`: a URL with other setup keys and no filters means the filters were cleared, and `limit`:
 * a URL at the default page size clears a saved one.
 */
export function mergeViewSetup(
  existing: StoredViewPreference | undefined,
  incoming: ViewSetup,
  defaultLimit?: number,
): StoredViewPreference {
  const {
    limit,
    where: _where,
    ...rest
  } = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};

  const kept = limit === undefined || isDefaultLimit(incoming.limit, defaultLimit) ? {} : { limit };

  return { ...rest, ...kept, ...withoutDefaultLimit(incoming, defaultLimit) };
}

/**
 * Removes a saved page size from a preference, such as Payload's `collection-<slug>`. It reads the
 * row directly: Payload caches preference reads per request, and its list view has already written
 * this row in the same request, so a cached merge would put back what that write changed.
 */
export async function clearStoredLimit(req: PayloadRequest, key: string): Promise<void> {
  if (!req.user) return;
  const { docs } = await req.payload.find({
    collection: 'payload-preferences',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [
        { key: { equals: key } },
        { 'user.relationTo': { equals: req.user.collection } },
        { 'user.value': { equals: req.user.id } },
      ],
    },
  });

  const doc = docs[0] as { id: number | string; value?: unknown } | undefined;
  const value = doc?.value;

  if (!doc || !value || typeof value !== 'object' || Array.isArray(value) || !('limit' in value)) {
    return;
  }

  const { limit: _limit, ...rest } = value as StoredViewPreference;

  await req.payload.update({
    id: doc.id,
    collection: 'payload-preferences',
    data: { value: rest },
    depth: 0,
    disableTransaction: true,
    overrideAccess: true,
    user: req.user,
  });
}

/** Payload's error for a filter on a field that doesn't exist or that the user can't read. */
export function isQueryError(error: unknown): boolean {
  return error instanceof Error && error.name === 'QueryError';
}

async function acceptsWhere(
  req: PayloadRequest,
  collectionSlug: string,
  where: unknown,
): Promise<boolean> {
  if (!where || typeof where !== 'object') return true;

  try {
    await req.payload.count({
      collection: collectionSlug,
      overrideAccess: false,
      req,
      where: where as Where,
    });

    return true;
  } catch (error) {
    if (isQueryError(error)) return false;
    throw error;
  }
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
 * Returns the stored value, the saved setup a fresh visit opens, and the query the view renders
 * with: the URL's own, or the saved setup when the URL sets none. A page size equal to
 * `defaultLimit` is never saved or replayed, so a later change to the default reaches everyone who
 * never picked a different size.
 */
export async function resolveViewSetup({
  collectionSlug,
  defaultLimit,
  query,
  req,
  viewSlug,
}: {
  collectionSlug: string;
  defaultLimit?: number;
  query: Record<string, unknown>;
  req: PayloadRequest;
  viewSlug: string;
}): Promise<{
  fresh: boolean;
  preference?: StoredViewPreference;
  preferenceKey: string;
  query: ListQuery;
  saved: ViewSetup;
}> {
  const preferenceKey = getViewPreferenceKey(collectionSlug, viewSlug);
  const fresh = isFreshQuery(query);

  if (fresh || !req.user) {
    const stored = await readViewPreference(req, preferenceKey);
    const refused = fresh && req.user && !(await acceptsWhere(req, collectionSlug, stored?.where));
    const preference = refused
      ? await upsertPreferences<StoredViewPreference>({
          customMerge: (existing) => mergeViewSetup(existing, {}),
          key: preferenceKey,
          req,
          value: {},
        })
      : stored;

    const saved = withoutDefaultLimit(pickViewSetup(preference), defaultLimit);

    return {
      fresh,
      preference,
      preferenceKey,
      query: fresh ? { ...saved, ...query } : query,
      saved,
    };
  }

  if (!(await acceptsWhere(req, collectionSlug, query.where))) {
    if (isDefaultLimit(query.limit, defaultLimit)) await clearStoredLimit(req, preferenceKey);
    const preference = await readViewPreference(req, preferenceKey);

    return {
      fresh,
      preference,
      preferenceKey,
      query,
      saved: withoutDefaultLimit(pickViewSetup(preference), defaultLimit),
    };
  }

  const incoming = pickViewSetup(query);
  const preference = await upsertPreferences<StoredViewPreference>({
    customMerge: (existing) => mergeViewSetup(existing, incoming, defaultLimit),
    key: preferenceKey,
    req,
    value: withoutDefaultLimit(incoming, defaultLimit),
  });

  return {
    fresh,
    preference,
    preferenceKey,
    query,
    saved: withoutDefaultLimit(pickViewSetup(preference), defaultLimit),
  };
}
