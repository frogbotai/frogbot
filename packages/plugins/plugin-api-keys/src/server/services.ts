import type { FrogBotRequest } from 'frogbot';

import { apiKeyStrategyName } from '../strategy.js';
import { createApiKeyToken, getApiKeyPrefix, hashApiKeyToken } from './token.js';

export type MintApiKeyOptions = {
  req: FrogBotRequest;
  collectionSlug: string;
  tokenPrefix: string;
  name: string;
  /**
   * Values for fields other plugins add to the keys collection. They're written with access
   * overridden, so their validation and hooks run but their field access doesn't.
   */
  data?: Record<string, unknown>;
};

export type RevokeApiKeyOptions = {
  req: FrogBotRequest;
  collectionSlug: string;
  id: string;
  anyOwner?: boolean;
};

type KeyDocument = Record<string, unknown>;

export class ApiKeyServiceError extends Error {
  constructor(public readonly code: 'authentication_required' | 'not_found' | 'session_required') {
    super(code);
  }
}

export function isApiKeyRequest(req: FrogBotRequest): boolean {
  return (req.user as { _strategy?: unknown } | null | undefined)?._strategy === apiKeyStrategyName;
}

function requireSessionOwner(req: FrogBotRequest) {
  const owner = req.user?.id;
  if (owner === undefined) throw new ApiKeyServiceError('authentication_required');
  if (isApiKeyRequest(req)) throw new ApiKeyServiceError('session_required');

  return owner;
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
  'totalCostUSD',
  'actions',
]);

function foreignData(data: Record<string, unknown> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data ?? {}).filter(([key]) => !ownFields.has(key)));
}

type MintForOwnerOptions = MintApiKeyOptions & {
  owner: string | number;
  context?: Record<string, unknown>;
};

async function mintForOwner({
  req,
  collectionSlug,
  tokenPrefix,
  name,
  owner,
  data,
  context,
}: MintForOwnerOptions) {
  const token = createApiKeyToken({ tokenPrefix });
  const prefix = getApiKeyPrefix(token);
  const doc = (await req.frogbot.create({
    collection: collectionSlug,
    data: { ...foreignData(data), name, owner, prefix, tokenHash: hashApiKeyToken(token) },
    overrideAccess: true,
    req,
    ...(context && { context }),
  })) as Record<string, unknown>;

  return { id: doc.id, name, prefix, token, createdAt: doc.createdAt };
}

export async function mintApiKey(options: MintApiKeyOptions) {
  const owner = requireSessionOwner(options.req);

  return mintForOwner({
    req: options.req,
    collectionSlug: options.collectionSlug,
    tokenPrefix: options.tokenPrefix,
    name: options.name,
    owner,
    data: options.data,
  });
}

type RevokedKey = KeyDocument & { id: string | number; name: string; owner: string | number };

async function revokeKey({ req, collectionSlug, id, anyOwner }: RevokeApiKeyOptions) {
  const owner = req.user?.id;
  if (owner === undefined) throw new ApiKeyServiceError('authentication_required');
  const result = await req.frogbot.find({
    collection: collectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    where: anyOwner
      ? { id: { equals: id } }
      : { and: [{ id: { equals: id } }, { owner: { equals: owner } }] },
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

  const revokedAt = typeof key.revokedAt === 'string' ? key.revokedAt : new Date().toISOString();

  await req.frogbot.update({
    collection: collectionSlug,
    id: key.id,
    data: { revokedAt },
    overrideAccess: true,
    req,
  });

  return { key: key as RevokedKey, revokedAt };
}

export async function revokeApiKey(options: RevokeApiKeyOptions) {
  const { key, revokedAt } = await revokeKey(options);

  return { id: key.id, name: key.name, owner: key.owner, revokedAt };
}

export type RotateApiKeyOptions = RevokeApiKeyOptions & { tokenPrefix: string };

/**
 * Revokes the key, then mints one with its name, owner and every field another plugin added, with
 * `req.context.apiKeyRotatedFrom` set to the revoked key's ID.
 */
export async function rotateApiKey({
  req,
  collectionSlug,
  id,
  tokenPrefix,
  anyOwner,
}: RotateApiKeyOptions) {
  requireSessionOwner(req);
  const { key } = await revokeKey({ req, collectionSlug, id, anyOwner });

  return mintForOwner({
    req,
    collectionSlug,
    tokenPrefix,
    name: key.name,
    owner: key.owner,
    data: key,
    context: { apiKeyRotatedFrom: key.id },
  });
}
