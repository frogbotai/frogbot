import type { CollectionConfig, Field, FrogBotRequest } from 'frogbot';

import { forgetTenants, inTenants } from '../access.js';
import type { TenancyResolvedOptions } from '../types.js';
import { mergeCollection, never, superUserOr, tenantNoun } from './utilities.js';

export function slugify(name: unknown, fallback: string): string {
  const slug = String(name ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');

  return slug || fallback;
}

async function uniqueSlug(req: FrogBotRequest, tenantsSlug: string, base: string): Promise<string> {
  for (let suffix = 1; ; suffix++) {
    const slug = suffix === 1 ? base : `${base}-${suffix}`;

    const { totalDocs } = await req.frogbot.count({
      collection: tenantsSlug,
      where: { slug: { equals: slug } },
      overrideAccess: true,
      req,
    });

    if (totalDocs === 0) return slug;
  }
}

export function tenantsCollection(options: TenancyResolvedOptions): CollectionConfig {
  const { tenantsSlug, membersSlug, tenantField, isSuperUser } = options;
  const fallbackSlug = slugify(tenantNoun(options), 'tenant');

  const fields: Field[] = [
    { name: 'name', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: { create: never, update: never },
      admin: { readOnly: true },
    },
  ];

  const membersJoin: Field = {
    name: 'members',
    type: 'join',
    collection: membersSlug,
    on: tenantField,
  };

  const base: CollectionConfig = {
    slug: tenantsSlug,
    versions: false,
    admin: { useAsTitle: 'name', icon: 'building' },
    access: {
      read: superUserOr(isSuperUser, inTenants('id')),
      create: ({ req }) => Boolean(req.user),
      update: superUserOr(isSuperUser, inTenants('id', { role: 'admin' })),
      delete: never,
    },
    hooks: {
      beforeValidate: [
        async ({ data, operation, req }) => {
          if (operation === 'create' && data) {
            data.slug = await uniqueSlug(req, tenantsSlug, slugify(data.name, fallbackSlug));
          }

          return data;
        },
      ],
      afterChange: [
        async ({ doc, operation, req }) => {
          if (operation !== 'create' || !req.user) return doc;

          await req.frogbot.create({
            collection: membersSlug,
            data: {
              [tenantField]: doc.id,
              email: req.user.email,
              user: req.user.id,
              role: 'owner',
            },
            overrideAccess: true,
            req,
          });

          forgetTenants(req);

          return doc;
        },
      ],
    },
    fields,
  };

  return mergeCollection(base, options.tenants, [membersJoin]);
}
