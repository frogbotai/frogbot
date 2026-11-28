import {
  type Access,
  type CollectionConfig,
  type CollectionView,
  type Endpoint,
  type Field,
  frogbotError,
  type FrogBotRequest,
  moneyField,
} from 'frogbot';

import {
  canMintKeys,
  countMintedApiKeys,
  keyScopeBeforeValidate,
  mintApiKey,
  revokeApiKey,
  rotateApiKey,
  sessionRequired,
} from './server/services.js';
import { signInRequired } from './strategy.js';

const managerComponent = (collectionSlug: string) => ({
  path: '@frogbotai/plugin-api-keys/rsc#ApiKeysManagerServer',
  clientProps: { collectionSlug },
});

type CollectionOptions = {
  authCollection: string;
  collectionSlug: string;
  tokenPrefix: string;
  usageCollection?: string;
  canRevokeAnyKey?: (req: FrogBotRequest) => boolean | Promise<boolean>;
  collection?: Partial<CollectionConfig>;
  existing?: CollectionConfig;
};

function invalid(path: string, message: string) {
  return frogbotError('request.invalid', { detail: message, fields: [{ path, message }] });
}

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

function createViews({
  usageCollection,
  views,
}: Pick<CollectionOptions, 'usageCollection'> & {
  views?: CollectionView[];
}): CollectionView[] {
  if (!views?.length) {
    return [
      {
        type: 'list',
        defaultFields: [
          'name',
          'prefix',
          ...(usageCollection ? ['totalCostUSD'] : []),
          'mintedBy',
          'lastUsedAt',
          'expiresAt',
          'revokedAt',
          'actions',
        ],
      },
    ];
  }

  return views;
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
        if (!req.user) throw signInRequired(req);
        if (!canMintKeys(req)) throw sessionRequired();
        const body = ((await req.json?.().catch(() => null)) ?? null) as {
          name?: unknown;
          data?: unknown;
          expiresAt?: unknown;
        } | null;

        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        if (!name) throw invalid('name', 'Name is required.');

        const data = body?.data ?? {};
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
          throw invalid('data', 'data must be an object.');
        }

        const expiresAt = body?.expiresAt ?? null;
        if (expiresAt !== null && typeof expiresAt !== 'string') {
          throw invalid('expiresAt', 'expiresAt must be a date string.');
        }

        return Response.json(
          await mintApiKey({
            req,
            collectionSlug,
            tokenPrefix,
            name,
            data: data as Record<string, unknown>,
            expiresAt,
          }),
          { status: 201 },
        );
      },
    },
    {
      method: 'post',
      path: '/:id/revoke',
      handler: async (req) => {
        if (!req.user) throw signInRequired(req);
        const id = req.routeParams?.id;
        if (typeof id !== 'string' || !id) {
          throw frogbotError('request.invalid', 'The key id is missing.');
        }

        const text = (await req.text?.()) ?? '';
        let cascade: unknown = true;

        try {
          const body: unknown = text.trim() ? JSON.parse(text) : null;
          if (typeof body === 'object' && body !== null && 'cascade' in body) {
            cascade = body.cascade;
          }
        } catch {
          throw frogbotError('request.invalid-json');
        }

        if (typeof cascade !== 'boolean') {
          throw invalid('cascade', 'cascade must be true or false.');
        }

        const anyOwner = (await canRevokeAnyKey?.(req)) === true;
        const {
          name: _name,
          owner: _owner,
          ...result
        } = await revokeApiKey({ req, collectionSlug, id, anyOwner, cascade });

        return Response.json(result);
      },
    },
    {
      method: 'get',
      path: '/:id/minted-count',
      handler: async (req) => {
        if (!req.user) throw signInRequired(req);
        const id = req.routeParams?.id;
        if (typeof id !== 'string' || !id) {
          throw frogbotError('request.invalid', 'The key id is missing.');
        }

        const anyOwner = (await canRevokeAnyKey?.(req)) === true;

        return Response.json({
          count: await countMintedApiKeys({ req, collectionSlug, id, anyOwner }),
        });
      },
    },
    {
      method: 'post',
      path: '/:id/rotate',
      handler: async (req) => {
        if (!req.user) throw signInRequired(req);
        if (!canMintKeys(req)) throw sessionRequired();
        const id = req.routeParams?.id;
        if (typeof id !== 'string' || !id) {
          throw frogbotError('request.invalid', 'The key id is missing.');
        }

        const anyOwner = (await canRevokeAnyKey?.(req)) === true;

        return Response.json(
          await rotateApiKey({ req, collectionSlug, id, tokenPrefix, anyOwner }),
          { status: 201 },
        );
      },
    },
  ];
}

export function createApiKeysCollection(options: CollectionOptions): CollectionConfig {
  const { authCollection, collectionSlug, collection, existing, usageCollection } = options;
  const fields: Field[] = [
    { name: 'name', type: 'text', required: true },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: authCollection,
      required: true,
      index: true,
      access: { update: () => false },
      admin: { position: 'sidebar' },
    },
    {
      name: 'prefix',
      type: 'text',
      required: true,
      index: true,
      access: { update: () => false },
      admin: { readOnly: true, position: 'sidebar' },
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
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'revokedAt',
      type: 'date',
      index: true,
      access: { update: () => false },
      admin: {
        readOnly: true,
        position: 'sidebar',
        condition: (_, siblingData) => Boolean(siblingData.revokedAt),
      },
    },
    {
      name: 'expiresAt',
      type: 'date',
      label: 'Expires',
      access: { update: () => false },
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'The key stops working at this time. Empty when it never expires.',
      },
    },
    {
      name: 'canMint',
      type: 'checkbox',
      label: 'Can mint keys',
      defaultValue: false,
      access: { update: () => false },
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Requests made with this key can mint and rotate keys no broader than it.',
      },
    },
    {
      name: 'mintedBy',
      type: 'relationship',
      relationTo: collectionSlug,
      label: 'Minted By',
      access: { update: () => false },
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'The key that minted this one. Empty when a signed-in session did.',
      },
    },
    ...(usageCollection
      ? [
          moneyField({
            name: 'totalCostUSD',
            label: 'Total Cost (USD)',
            virtual: true,
            admin: { readOnly: true, position: 'sidebar' },
            hooks: {
              afterRead: [
                async ({ data, req }: { data?: Record<string, unknown>; req: FrogBotRequest }) => {
                  if (data?.id === undefined) return 0;
                  const result = await req.frogbot.find({
                    collection: usageCollection,
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
          }),
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
    versions: false,
    authorship: false,
    custom: { frogbot: { internal: true } },
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
      icon: 'key-round',
      useAsTitle: 'name',
      ...existing?.admin,
      ...collection?.admin,
      components: {
        CreateButton: managerComponent(collectionSlug),
        ...existing?.admin?.components,
        ...collection?.admin?.components,
      },
      views: createViews({
        usageCollection,
        views: collection?.admin?.views ?? existing?.admin?.views,
      }),
    },
    endpoints: [...endpoints, ...(existing?.endpoints ?? []), ...(collection?.endpoints ?? [])],
    fields: mergeFields(fields, existing?.fields, collection?.fields),
    hooks: {
      ...existing?.hooks,
      ...collection?.hooks,
      beforeValidate: [
        keyScopeBeforeValidate,
        ...(collection?.hooks?.beforeValidate ?? existing?.hooks?.beforeValidate ?? []),
      ],
    },
  };
}
