import type { CollectionConfig, Endpoint, Field, FrogbotRequest } from 'frogbot';

import { createApiKeyToken, getApiKeyPrefix, hashApiKeyToken } from './server/token.js';

type CollectionOptions = {
  authCollection: string;
  collectionSlug: string;
  tokenPrefix: string;
  collection?: Partial<CollectionConfig>;
  existing?: CollectionConfig;
};

function mergeFields(...groups: (Field[] | undefined)[]): Field[] {
  const fields = new Map<string, Field>();
  for (const group of groups) {
    for (const field of group ?? []) {
      const key = 'name' in field && field.name ? field.name : JSON.stringify(field);
      fields.set(key, field);
    }
  }
  return [...fields.values()];
}

function getOwnerID(req: FrogbotRequest): string | number | null {
  return req.user?.id ?? null;
}

function createEndpoints({ collectionSlug, tokenPrefix }: Pick<CollectionOptions, 'collectionSlug' | 'tokenPrefix'>): Endpoint[] {
  return [
    {
      method: 'post',
      path: '/mint',
      handler: async (req) => {
        const owner = getOwnerID(req);
        if (owner === null) return Response.json({ error: 'Authentication required' }, { status: 401 });

        const body = (await req.json?.().catch(() => null) ?? null) as { name?: unknown } | null;
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        if (!name) return Response.json({ error: 'Name is required' }, { status: 400 });

        const token = createApiKeyToken({ tokenPrefix });
        const prefix = getApiKeyPrefix(token);
        const doc = (await req.frogbot.create({
          collection: collectionSlug as never,
          data: {
            name,
            owner,
            prefix,
            tokenHash: hashApiKeyToken(token),
          },
          overrideAccess: true,
          req,
        })) as Record<string, unknown>;

        return Response.json({ id: doc.id, name, prefix, token, createdAt: doc.createdAt }, { status: 201 });
      },
    },
    {
      method: 'post',
      path: '/:id/revoke',
      handler: async (req) => {
        const owner = getOwnerID(req);
        if (owner === null) return Response.json({ error: 'Authentication required' }, { status: 401 });

        const id = req.routeParams?.id;
        if (typeof id !== 'string' || !id) return Response.json({ error: 'API key not found' }, { status: 404 });
        const result = await req.frogbot.find({
          collection: collectionSlug as never,
          limit: 1,
          overrideAccess: true,
          req,
          where: { and: [{ id: { equals: id } }, { owner: { equals: owner } }] },
        });
        const key = result.docs[0] as Record<string, unknown> | undefined;
        if (!key) return Response.json({ error: 'API key not found' }, { status: 404 });

        const revokedAt = typeof key.revokedAt === 'string' ? key.revokedAt : new Date().toISOString();
        await req.frogbot.update({
          collection: collectionSlug as never,
          id: key.id as never,
          data: { revokedAt },
          overrideAccess: true,
          req,
        });
        return Response.json({ id: key.id, revokedAt });
      },
    },
  ];
}

export function createApiKeysCollection(options: CollectionOptions): CollectionConfig {
  const { authCollection, collectionSlug, collection, existing } = options;
  const ownerAccess = ({ req }: { req: FrogbotRequest }) => {
    const owner = getOwnerID(req);
    return owner === null ? false : { owner: { equals: owner } };
  };
  const fields: Field[] = [
    { name: 'name', type: 'text', required: true },
    { name: 'owner', type: 'relationship', relationTo: authCollection, required: true, index: true },
    { name: 'prefix', type: 'text', required: true, index: true, admin: { readOnly: true } },
    { name: 'tokenHash', type: 'text', required: true, unique: true, index: true, access: { read: () => false }, admin: { hidden: true } },
    { name: 'lastUsedAt', type: 'date', admin: { readOnly: true } },
    { name: 'revokedAt', type: 'date', index: true, admin: { readOnly: true } },
    {
      name: 'actions',
      type: 'ui',
      admin: { components: { Cell: '@frogbotai/plugin-api-keys/client#RevokeApiKey' } },
    },
  ];
  const endpoints = createEndpoints(options);

  return {
    slug: collectionSlug,
    labels: { singular: 'API Key', plural: 'API Keys' },
    timestamps: true,
    ...existing,
    ...collection,
    access: {
      create: () => false,
      delete: () => false,
      read: ownerAccess,
      update: () => false,
      ...existing?.access,
      ...collection?.access,
    },
    admin: {
      useAsTitle: 'name',
      ...existing?.admin,
      ...collection?.admin,
      defaultColumns: collection?.admin?.defaultColumns ?? existing?.admin?.defaultColumns ?? [
        'name',
        'prefix',
        'lastUsedAt',
        'revokedAt',
        'actions',
      ],
      components: {
        ...existing?.admin?.components,
        ...collection?.admin?.components,
        beforeListTable: [
          '@frogbotai/plugin-api-keys/client#ApiKeysManager',
          ...(existing?.admin?.components?.beforeListTable ?? []),
          ...(collection?.admin?.components?.beforeListTable ?? []),
        ],
      },
    },
    endpoints: [...endpoints, ...(existing?.endpoints ?? []), ...(collection?.endpoints ?? [])],
    fields: mergeFields(fields, existing?.fields, collection?.fields),
    hooks: {
      ...existing?.hooks,
      ...collection?.hooks,
    },
  };
}
