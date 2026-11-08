import { isDeepStrictEqual } from 'node:util';

import {
  APIError,
  type CollectionBeforeValidateHook,
  type FrogBotRequest,
  type Where,
} from 'frogbot';

import { apiKeyStrategyName } from '../strategy.js';
import { createApiKeyToken, getApiKeyPrefix, hashApiKeyToken } from './token.js';

export type MintApiKeyOptions = {
  req: FrogBotRequest;
  collectionSlug: string;
  tokenPrefix: string;
  name: string;
  /**
   * Values for fields other plugins add to the keys collection. They're written with access
   * overridden, so their validation and hooks run but their field access doesn't. A key minted by a
   * key takes its parent's values for them instead.
   */
  data?: Record<string, unknown>;
};

export type RevokeApiKeyOptions = {
  req: FrogBotRequest;
  collectionSlug: string;
  id: string;
  anyOwner?: boolean;
  /**
   * Also revoke every key this key minted, down the whole `mintedBy` tree. Defaults to `true`;
   * `false` revokes only this key and leaves the keys it made working.
   */
  cascade?: boolean;
};

type KeyDocument = Record<string, unknown>;

type KeyID = string | number;

export class ApiKeyServiceError extends Error {
  constructor(public readonly code: 'authentication_required' | 'not_found' | 'session_required') {
    super(code);
  }
}

export function isApiKeyRequest(req: FrogBotRequest): boolean {
  return (req.user as { _strategy?: unknown } | null | undefined)?._strategy === apiKeyStrategyName;
}

/** True when the request is a signed-in session, or an API key with `canMint`. */
export function canMintKeys(req: FrogBotRequest): boolean {
  if (!isApiKeyRequest(req)) return true;

  return (req.user as { apiKey?: { canMint?: unknown } }).apiKey?.canMint === true;
}

const keyID = (value: unknown): KeyID | null =>
  typeof value === 'string' || typeof value === 'number' ? value : null;

function requireMinter(req: FrogBotRequest) {
  const owner = req.user?.id;
  if (owner === undefined) throw new ApiKeyServiceError('authentication_required');
  if (!canMintKeys(req)) throw new ApiKeyServiceError('session_required');

  const parent = isApiKeyRequest(req) ? (req.user as { apiKeyId?: unknown }).apiKeyId : undefined;

  return { owner, mintedBy: keyID(parent) };
}

const ownFields = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'name',
  'owner',
  'prefix',
  'tokenHash',
  'lastUsedAt',
  'revokedAt',
  'canMint',
  'mintedBy',
  'totalCostUSD',
  'actions',
]);

function foreignData(data: Record<string, unknown> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data ?? {}).filter(([key]) => !ownFields.has(key)));
}

type InheritField = {
  name: string;
  type: string;
  virtual?: unknown;
  custom?: Record<string, unknown>;
};

const inherits = ({ name, type, virtual, custom }: InheritField) =>
  !ownFields.has(name) &&
  type !== 'ui' &&
  type !== 'join' &&
  !virtual &&
  (custom?.['plugin-api-keys'] as { inherit?: unknown } | undefined)?.inherit !== false;

const keyName = (key: KeyDocument) =>
  `API key "${typeof key.name === 'string' ? key.name : String(key.id)}"`;

/**
 * Keeps keys inside the fields other plugins add to the keys collection: a key minted by a key
 * takes its parent's values, and a request made with a key can't change them on any key. A field
 * that sets `custom['plugin-api-keys'].inherit` to `false` is left to the plugin that adds it.
 */
export const keyScopeBeforeValidate: CollectionBeforeValidateHook = ({
  collection,
  data,
  operation,
  originalDoc,
  req,
}) => {
  const parent = isApiKeyRequest(req) ? (req.user as { apiKey?: KeyDocument }).apiKey : undefined;

  if (!data || !parent) return data;

  const names = ((collection as { flattenedFields?: InheritField[] }).flattenedFields ?? [])
    .filter(inherits)
    .map(({ name }) => name);

  if (operation === 'create') {
    return { ...data, ...Object.fromEntries(names.map((name) => [name, parent[name] ?? null])) };
  }

  const original = (originalDoc ?? {}) as KeyDocument;
  const changed = names.find(
    (name) => name in data && !isDeepStrictEqual(data[name] ?? null, original[name] ?? null),
  );

  if (changed) {
    throw new APIError(
      `${keyName(parent)} can't change "${changed}" on a key. Sign in to change it.`,
      403,
    );
  }

  return data;
};

type MintForOwnerOptions = MintApiKeyOptions & {
  owner: KeyID;
  mintedBy: KeyID | null;
  context?: Record<string, unknown>;
};

async function mintForOwner({
  req,
  collectionSlug,
  tokenPrefix,
  name,
  owner,
  mintedBy,
  data,
  context,
}: MintForOwnerOptions) {
  const token = createApiKeyToken({ tokenPrefix });
  const prefix = getApiKeyPrefix(token);
  const doc = (await req.frogbot.create({
    collection: collectionSlug,
    data: {
      ...foreignData(data),
      name,
      owner,
      prefix,
      tokenHash: hashApiKeyToken(token),
      canMint: data?.canMint === true,
      mintedBy,
    },
    overrideAccess: true,
    req,
    ...(context && { context }),
  })) as Record<string, unknown>;

  return {
    id: doc.id,
    name,
    prefix,
    token,
    canMint: data?.canMint === true,
    mintedBy,
    createdAt: doc.createdAt,
  };
}

/**
 * Mints a key for the signed-in user. A request made with an API key needs that key's `canMint`,
 * and the new key records it as `mintedBy` and copies its fields from other plugins.
 */
export async function mintApiKey(options: MintApiKeyOptions) {
  const { owner, mintedBy } = requireMinter(options.req);

  return mintForOwner({
    req: options.req,
    collectionSlug: options.collectionSlug,
    tokenPrefix: options.tokenPrefix,
    name: options.name,
    owner,
    mintedBy,
    data: options.data,
  });
}

type RevokedKey = KeyDocument & { id: KeyID; name: string; owner: KeyID };

type FindKeyOptions = RevokeApiKeyOptions & {
  rotator?: KeyID | null;
};

async function findKey({ req, collectionSlug, id, anyOwner, rotator }: FindKeyOptions) {
  const owner = req.user?.id;
  if (owner === undefined) throw new ApiKeyServiceError('authentication_required');

  const scope: Where[] = [
    { id: { equals: id } },
    ...(anyOwner ? [] : [{ owner: { equals: owner } }]),
    ...(rotator == null
      ? []
      : [{ or: [{ id: { equals: rotator } }, { mintedBy: { equals: rotator } }] }]),
  ];

  const result = await req.frogbot.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    where: scope.length === 1 ? scope[0] : { and: scope },
  });

  const key = result.docs[0] as KeyDocument | undefined;
  if (
    !key ||
    (typeof key.id !== 'string' && typeof key.id !== 'number') ||
    typeof key.name !== 'string' ||
    (typeof key.owner !== 'string' && typeof key.owner !== 'number')
  ) {
    throw new ApiKeyServiceError('not_found');
  }

  return key as RevokedKey;
}

async function markRevoked(
  req: FrogBotRequest,
  collectionSlug: string,
  key: RevokedKey,
  now = new Date().toISOString(),
) {
  const revokedAt = typeof key.revokedAt === 'string' ? key.revokedAt : now;

  await req.frogbot.update({
    collection: collectionSlug,
    id: key.id,
    data: { revokedAt },
    overrideAccess: true,
    req,
  });

  return revokedAt;
}

async function liveMinted(req: FrogBotRequest, collectionSlug: string, id: KeyID) {
  const seen = new Set<KeyID>([id]);
  const live: KeyID[] = [];

  for (let parents = [id]; parents.length > 0;) {
    const { docs } = await req.frogbot.find({
      collection: collectionSlug,
      where: { mintedBy: { in: parents } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    });

    const children = (docs as KeyDocument[]).filter((child) => !seen.has(child.id as KeyID));

    live.push(...children.filter((child) => !child.revokedAt).map((child) => child.id as KeyID));
    parents = children.map((child) => child.id as KeyID);
    parents.forEach((child) => seen.add(child));
  }

  return live;
}

/** Counts the keys a cascading revoke of the key would also revoke. */
export async function countMintedApiKeys(options: RevokeApiKeyOptions) {
  const key = await findKey(options);

  return (await liveMinted(options.req, options.collectionSlug, key.id)).length;
}

/**
 * Revokes the key and, unless `cascade` is `false`, every live key below it in the `mintedBy`
 * tree, including keys under a key that was revoked on its own earlier. Those keys get the time of
 * this revoke.
 */
export async function revokeApiKey(options: RevokeApiKeyOptions) {
  const { req, collectionSlug } = options;
  const key = await findKey(options);
  const now = new Date().toISOString();
  const revokedAt = await markRevoked(req, collectionSlug, key, now);
  const live = options.cascade === false ? [] : await liveMinted(req, collectionSlug, key.id);

  if (live.length > 0) {
    await req.frogbot.update({
      collection: collectionSlug,
      where: { id: { in: live } },
      data: { revokedAt: now },
      depth: 0,
      overrideAccess: true,
      req,
    });
  }

  return { id: key.id, name: key.name, owner: key.owner, revokedAt };
}

export type RotateApiKeyOptions = RevokeApiKeyOptions & { tokenPrefix: string };

/**
 * Mints a key with the old key's name, owner, `canMint`, `mintedBy` and every field another plugin
 * added, with `req.context.apiKeyRotatedFrom` set to the old key's ID, then moves the keys the old
 * one minted to the new one and revokes the old one. A refused mint leaves the old key working. A
 * key rotates only itself and the keys it minted; any other key is not found.
 */
export async function rotateApiKey({
  req,
  collectionSlug,
  id,
  tokenPrefix,
  anyOwner,
}: RotateApiKeyOptions) {
  const { mintedBy: rotator } = requireMinter(req);
  const key = await findKey({ req, collectionSlug, id, anyOwner, rotator });

  const minted = await mintForOwner({
    req,
    collectionSlug,
    tokenPrefix,
    name: key.name,
    owner: key.owner,
    mintedBy: keyID(key.mintedBy),
    data: key,
    context: { apiKeyRotatedFrom: key.id },
  });

  await req.frogbot.update({
    collection: collectionSlug,
    where: { mintedBy: { equals: key.id } },
    data: { mintedBy: minted.id },
    depth: 0,
    overrideAccess: true,
    req,
  });

  await markRevoked(req, collectionSlug, key);

  return minted;
}
