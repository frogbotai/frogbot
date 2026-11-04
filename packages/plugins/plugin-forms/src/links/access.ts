import type { Access, AccessResult, FrogBotRequest, Where } from 'frogbot';
import { getPayloadConfig, toPayloadRequest } from 'frogbot/internal';

export const FORM_LINKS_SLUG = 'form-links';

const CREATE_KEY = 'plugin-forms:create-link';
const creating = new WeakSet<object>();

/** Runs `fn` with the request allowed to make `form-links` rows: only `createFormLink` does. */
export async function asLinkCreate<T>(req: FrogBotRequest, fn: () => Promise<T>): Promise<T> {
  const flag = Object.freeze({});
  creating.add(flag);
  req.context[CREATE_KEY] = flag;

  try {
    return await fn();
  } finally {
    delete req.context[CREATE_KEY];
  }
}

export function isLinkCreate(req: Pick<FrogBotRequest, 'context'>): boolean {
  const value: unknown = req.context?.[CREATE_KEY];

  return typeof value === 'object' && value !== null && creating.has(value);
}

/** The records of one collection whose links a user may manage: all of them, or these IDs. */
export type RecordGrant = { collection: string; ids?: string[] };

/** The collection's `access.update` as Payload runs it, with its default when there is none. */
export async function updateRule(req: FrogBotRequest, slug: string) {
  const config = await getPayloadConfig(req.frogbot.config);

  return config.collections.find((collection) => collection.slug === slug)?.access.update;
}

async function matchingIds(req: FrogBotRequest, slug: string, where: Where): Promise<string[]> {
  const result = await req.frogbot.find({
    collection: slug,
    where,
    pagination: false,
    select: {},
    depth: 0,
    overrideAccess: true,
    req,
  });

  return result.docs.map(({ id }) => String(id));
}

/** True when the request's user passes `slug`'s update rule for the record `id`. */
export async function canUpdateRecord(
  req: FrogBotRequest,
  slug: string,
  id: number | string,
): Promise<boolean> {
  const rule = await updateRule(req, slug);
  const result: AccessResult = rule
    ? await rule({ req: toPayloadRequest(req), id, slug })
    : Boolean(req.user);

  if (result === true) return true;
  if (!result) return false;

  const ids = await matchingIds(req, slug, { and: [{ id: { equals: id } }, result] });

  return ids.length > 0;
}

/** The records of each collection whose update rule the request's user passes. */
export async function recordGrants(req: FrogBotRequest, slugs: string[]): Promise<RecordGrant[]> {
  const grants: RecordGrant[] = [];

  for (const slug of slugs) {
    const rule = await updateRule(req, slug);
    const result: AccessResult = rule
      ? await rule({ req: toPayloadRequest(req), slug })
      : Boolean(req.user);

    if (result === true) grants.push({ collection: slug });
    else if (result) grants.push({ collection: slug, ids: await matchingIds(req, slug, result) });
  }

  return grants;
}

/** The `form-links` rows those grants cover, or `false` for none. */
export function linksWhere(grants: RecordGrant[]): Where | false {
  const clauses = grants.flatMap(({ collection, ids }): Where[] => {
    if (!ids) return [{ collection: { equals: collection } }];
    if (!ids.length) return [];

    return [{ and: [{ collection: { equals: collection } }, { recordId: { in: ids } }] }];
  });

  if (!clauses.length) return false;

  return clauses.length === 1 ? clauses[0] : { or: clauses };
}

/** Default `form-links` access: people who can update a record manage its links. */
export function linksAccess(slugs: string[]): Access {
  return async ({ req }) => linksWhere(await recordGrants(req, slugs));
}
