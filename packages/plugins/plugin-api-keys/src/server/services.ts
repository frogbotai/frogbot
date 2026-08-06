import { hasRole } from '@frogbotai/plugin-roles';
import type { FrogbotRequest } from 'frogbot';

import { createApiKeyToken, getApiKeyPrefix, hashApiKeyToken } from './token.js';

export type MintApiKeyOptions = {
  req: FrogbotRequest;
  collectionSlug: string;
  tokenPrefix: string;
  name: string;
};

export type RevokeApiKeyOptions = {
  req: FrogbotRequest;
  collectionSlug: string;
  id: string;
};

export class ApiKeyServiceError extends Error {
  constructor(
    public readonly code: 'authentication_required' | 'not_found',
  ) {
    super(code);
  }
}

type MintForOwnerOptions = MintApiKeyOptions & { owner: string | number };

async function mintForOwner({ req, collectionSlug, tokenPrefix, name, owner }: MintForOwnerOptions) {
  const token = createApiKeyToken({ tokenPrefix });
  const prefix = getApiKeyPrefix(token);
  const doc = await req.frogbot.create({
    collection: collectionSlug as never,
    data: { name, owner, prefix, tokenHash: hashApiKeyToken(token) },
    overrideAccess: true,
    req,
  }) as Record<string, unknown>;
  return { id: doc.id, name, prefix, token, createdAt: doc.createdAt };
}

export async function mintApiKey(options: MintApiKeyOptions) {
  const owner = options.req.user?.id;
  if (owner === undefined) throw new ApiKeyServiceError('authentication_required');
  return mintForOwner({
    req: options.req,
    collectionSlug: options.collectionSlug,
    tokenPrefix: options.tokenPrefix,
    name: options.name,
    owner,
  });
}

export type RotateApiKeyOptions = RevokeApiKeyOptions & { tokenPrefix: string };

export async function rotateApiKey({ req, collectionSlug, id, tokenPrefix }: RotateApiKeyOptions) {
  const revoked = await revokeApiKey({ req, collectionSlug, id });
  return mintForOwner({ req, collectionSlug, tokenPrefix, name: revoked.name, owner: revoked.owner });
}

export async function revokeApiKey({ req, collectionSlug, id }: RevokeApiKeyOptions) {
  const owner = req.user?.id;
  if (owner === undefined) throw new ApiKeyServiceError('authentication_required');
  const result = await req.frogbot.find({
    collection: collectionSlug as never,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    where: hasRole(req, 'admin', 'support')
      ? { id: { equals: id } }
      : { and: [{ id: { equals: id } }, { owner: { equals: owner } }] },
  });
  const key = result.docs[0] as Record<string, unknown> | undefined;
  if (!key || (typeof key.id !== 'string' && typeof key.id !== 'number') || typeof key.name !== 'string' || (typeof key.owner !== 'string' && typeof key.owner !== 'number')) {
    throw new ApiKeyServiceError('not_found');
  }
  const revokedAt = typeof key.revokedAt === 'string' ? key.revokedAt : new Date().toISOString();
  await req.frogbot.update({
    collection: collectionSlug as never,
    id: key.id as never,
    data: { revokedAt },
    overrideAccess: true,
    req,
  });
  return { id: key.id, name: key.name, owner: key.owner, revokedAt };
}
