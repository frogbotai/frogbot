import type {
  Access,
  CollectionConfig,
  Endpoint,
  Field,
  FieldAccess,
  FrogbotRequest,
} from 'frogbot';

import { createPolicyFields } from './fields.js';
import { ApiKeyServiceError, mintApiKey, revokeApiKey, rotateApiKey } from './server/services.js';

type CollectionOptions = {
  authCollection: string;
  collectionSlug: string;
  tokenPrefix: string;
  usageCollection?: string;
  policyAccess?: FieldAccess;
  canRevokeAnyKey?: (req: FrogbotRequest) => boolean | Promise<boolean>;
  collection?: Partial<CollectionConfig>;
  existing?: CollectionConfig;
};

const ownKeys: Access = ({ req }) => (req.user ? { owner: { equals: req.user.id } } : false);

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

function createEndpoints({
  collectionSlug,
  tokenPrefix,
  canRevokeAnyKey,
}: Pick<CollectionOptions, 'collectionSlug' | 'tokenPrefix' | 'canRevokeAnyKey'>): Endpoint[] {
  return [
    {
      method: 'post',
      path: '/mint',
      handler: async (req) => {
        if (!req.user) return Response.json({ error: 'Authentication required' }, { status: 401 });
        const body = ((await req.json?.().catch(() => null)) ?? null) as { name?: unknown } | null;
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        if (!name) return Response.json({ error: 'Name is required' }, { status: 400 });
        try {
          return Response.json(await mintApiKey({ req, collectionSlug, tokenPrefix, name }), {
            status: 201,
          });
        } catch (error) {
          if (error instanceof ApiKeyServiceError && error.code === 'authentication_required') {
            return Response.json({ error: 'Authentication required' }, { status: 401 });
          }
          throw error;
        }
      },
    },
    {
      method: 'post',
      path: '/:id/revoke',
      handler: async (req) => {
        if (!req.user) return Response.json({ error: 'Authentication required' }, { status: 401 });
        const id = req.routeParams?.id;
        if (typeof id !== 'string' || !id) {
          return Response.json({ error: 'API key not found' }, { status: 404 });
        }
        try {
          const anyOwner = (await canRevokeAnyKey?.(req)) === true;
          const {
            name: _name,
            owner: _owner,
            ...result
          } = await revokeApiKey({ req, collectionSlug, id, anyOwner });
          return Response.json(result);
        } catch (error) {
          if (error instanceof ApiKeyServiceError && error.code === 'authentication_required') {
            return Response.json({ error: 'Authentication required' }, { status: 401 });
          }
          if (error instanceof ApiKeyServiceError && error.code === 'not_found') {
            return Response.json({ error: 'API key not found' }, { status: 404 });
          }
          throw error;
        }
      },
    },
    {
      method: 'post',
      path: '/:id/rotate',
      handler: async (req) => {
        if (!req.user) return Response.json({ error: 'Authentication required' }, { status: 401 });
        const id = req.routeParams?.id;
        if (typeof id !== 'string' || !id) {
          return Response.json({ error: 'API key not found' }, { status: 404 });
        }
        try {
          const anyOwner = (await canRevokeAnyKey?.(req)) === true;
          return Response.json(
            await rotateApiKey({ req, collectionSlug, id, tokenPrefix, anyOwner }),
            { status: 201 },
          );
        } catch (error) {
          if (error instanceof ApiKeyServiceError && error.code === 'authentication_required') {
            return Response.json({ error: 'Authentication required' }, { status: 401 });
          }
          if (error instanceof ApiKeyServiceError && error.code === 'not_found') {
            return Response.json({ error: 'API key not found' }, { status: 404 });
          }
          throw error;
        }
      },
    },
  ];
}

export function createApiKeysCollection(options: CollectionOptions): CollectionConfig {
  const { authCollection, collectionSlug, collection, existing, policyAccess, usageCollection } =
    options;
  const fields: Field[] = [
    { name: 'name', type: 'text', required: true },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: authCollection,
      required: true,
      index: true,
      access: { update: () => false },
    },
    {
      name: 'prefix',
      type: 'text',
      required: true,
      index: true,
      access: { update: () => false },
      admin: { readOnly: true },
    },
    {
      name: 'tokenHash',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: { read: () => false, update: () => false },
      admin: { hidden: true },
    },
    {
      name: 'lastUsedAt',
      type: 'date',
      access: { update: () => false },
      admin: { readOnly: true },
    },
    ...createPolicyFields(true, policyAccess),
    {
      name: 'revokedAt',
      type: 'date',
      index: true,
      access: { update: () => false },
      admin: { readOnly: true, condition: (_, siblingData) => Boolean(siblingData.revokedAt) },
    },
    ...(usageCollection
      ? [
          {
            name: 'totalCostUSD',
            type: 'number' as const,
            label: 'Total Cost (USD)',
            virtual: true,
            admin: {
              readOnly: true,
              components: {
                Cell: '@frogbotai/plugin-api-keys/client#CostUSDCell',
                Field: '@frogbotai/plugin-api-keys/client#CostUSDField',
              },
            },
            hooks: {
              afterRead: [
                async ({ data, req }: { data?: Record<string, unknown>; req: FrogbotRequest }) => {
                  if (data?.id === undefined) return 0;
                  const result = await req.frogbot.find({
                    collection: usageCollection as never,
                    depth: 0,
                    overrideAccess: true,
                    pagination: false,
                    req,
                    where: { apiKey: { equals: data.id } },
                  });
                  return result.docs.reduce((total, doc) => {
                    const cost = (doc as Record<string, unknown>).costUSD;
                    return total + (typeof cost === 'number' ? cost : 0);
                  }, 0);
                },
              ],
            },
          },
        ]
      : []),
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
      read: ownKeys,
      update: ownKeys,
      ...existing?.access,
      ...collection?.access,
    },
    admin: {
      useAsTitle: 'name',
      ...existing?.admin,
      ...collection?.admin,
      defaultColumns: collection?.admin?.defaultColumns ??
        existing?.admin?.defaultColumns ?? [
          'name',
          'prefix',
          ...(usageCollection ? ['totalCostUSD'] : []),
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
