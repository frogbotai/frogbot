import { allow, rolesPlugin } from '@frogbotai/plugin-roles';
import type { Access, CollectionConfig, Where } from 'frogbot';
import { buildConfig } from 'frogbot';

import { createCoreConfig, Users } from './core-context.js';

export function organizationScoped(): Access {
  return ({ req }) => {
    const user = req.user;

    if (!user) return false;

    const organizationIds = Array.isArray(user.organizationIds)
      ? user.organizationIds.filter(
          (id): id is number | string => typeof id === 'number' || typeof id === 'string',
        )
      : [];

    return {
      organization: { in: organizationIds },
    };
  };
}

export const publishedOrOwned: Access = ({ req }): Where => {
  if (!req.user) {
    return {
      status: {
        equals: 'published',
      },
    };
  }

  return {
    or: [
      {
        status: {
          equals: 'published',
        },
      },
      {
        author: {
          equals: req.user.id,
        },
      },
    ],
  };
};

export function recentRecords(days: number): Access {
  return ({ req }) => {
    if (!req.user) return false;

    const cutoff = new Date();

    cutoff.setDate(cutoff.getDate() - days);

    return { createdAt: { greater_than_equal: cutoff.toISOString() } };
  };
}

export const Projects: CollectionConfig = {
  slug: 'projects',
  access: {
    create: allow({ role: 'member', own: 'owner' }),
    read: allow('admin', { role: 'member', own: 'owner' }),
    update: allow('admin', { role: 'member', own: 'owner' }),
    delete: allow('admin'),
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'owner', type: 'relationship', relationTo: 'users', required: true, index: true },
  ],
};

export const MemberDocuments: CollectionConfig = {
  slug: 'member-documents',
  access: {
    create: allow('member'),
    read: allow('member'),
    update: allow('owner'),
    delete: allow('admin'),
  },
  fields: [{ name: 'title', type: 'text', required: true }],
};

export const rolesConfig = buildConfig({
  ...createCoreConfig(),
  collections: [Users, MemberDocuments],
  plugins: [
    rolesPlugin({
      roles: ['admin', 'member', 'owner'],
      defaultRole: 'member',
      rolesFieldAccess: { update: allow('owner') },
    }),
  ],
});

export const ownedRowsConfig = buildConfig({
  ...createCoreConfig(),
  collections: [Users, Projects],
  plugins: [
    rolesPlugin({
      roles: ['admin', 'member', 'owner'],
      defaultRole: 'member',
      rolesFieldAccess: { update: allow('owner') },
    }),
  ],
});

export const activeAccount: Access = async ({ req }) => {
  if (!req.user) return false;

  if (typeof req.context.activeAccount === 'boolean') {
    return req.context.activeAccount;
  }

  const user = await req.frogbot.findByID({
    collection: 'users',
    id: req.user.id,
    req,
  });

  const allowed = user.status === 'active';

  req.context.activeAccount = allowed;

  return allowed;
};
