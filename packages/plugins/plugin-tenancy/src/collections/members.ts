import type { CollectionConfig, FrogBotRequest, Where } from 'frogbot';
import { APIError } from 'frogbot';
import { toPayloadRequest } from 'frogbot/internal';

import { forgetTenants, includesID, inTenants, myTenants, relationID } from '../access.js';
import { type TenancyResolvedOptions, tenantRoles } from '../types.js';
import { deletingTenant, handingOver, keepOneOwner, lockTenant, ownerMessages } from './owner.js';
import { mergeCollection, never, superUserOr, tenantNoun } from './utilities.js';

/** The members collection: who is in each tenant, at which role, with exactly one Owner per tenant. */
export function membersCollection(options: TenancyResolvedOptions): CollectionConfig {
  const {
    authCollection,
    membersSlug,
    tenantsSlug,
    tenantField,
    isSuperUser,
    requestTenant,
    handover,
  } = options;

  const noun = tenantNoun(options);
  const refuse = (message: string, status: number) =>
    new APIError(message, status, undefined, true);

  const rowsOf = async (req: FrogBotRequest, where: Where) => {
    const { docs } = await req.frogbot.find({
      collection: membersSlug,
      where,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    });

    return docs.map((doc): Record<string, unknown> => ({ ...doc }));
  };

  const guardOwnerRows = async (
    req: FrogBotRequest,
    rows: Record<string, unknown>[],
    overrideAccess: boolean,
  ) => {
    const owner = rows.find(({ role }) => role === 'owner');
    if (!owner) return;
    const own =
      overrideAccess ||
      relationID(owner.user) === relationID(req.user?.id) ||
      Boolean(await isSuperUser?.(req));

    if (own) throw refuse(ownerMessages.handOverFirst(noun), 409);
    throw refuse(ownerMessages.ownerOnly(noun), 403);
  };

  const guardLastMember = async (req: FrogBotRequest, rows: Record<string, unknown>[]) => {
    const me = relationID(req.user?.id);

    for (const row of rows) {
      if (!me || relationID(row.user) !== me) continue;
      const others = await req.frogbot.count({
        collection: membersSlug,
        where: {
          [tenantField]: { equals: relationID(row[tenantField]) },
          user: { exists: true },
          id: { not_equals: row.id },
        },
        overrideAccess: true,
        req,
      });

      if (others.totalDocs === 0) throw refuse(ownerMessages.lastMember(noun), 409);
    }
  };

  const guardNewOwner = async (req: FrogBotRequest, data: Record<string, unknown>) => {
    if (data.role !== 'owner') return;
    const owners = await req.frogbot.count({
      collection: membersSlug,
      where: {
        [tenantField]: { equals: relationID(data[tenantField]) },
        role: { equals: 'owner' },
      },
      overrideAccess: true,
      req,
    });

    if (owners.totalDocs > 0 || !data.user) {
      throw refuse(ownerMessages.onlyByHandover(noun, handover), 400);
    }
  };

  const base: CollectionConfig = {
    slug: membersSlug,
    versions: false,
    admin: { useAsTitle: 'email', icon: 'people' },
    access: {
      read: superUserOr(isSuperUser, inTenants(tenantField)),
      create: async ({ req, data }) =>
        Boolean(req.user) &&
        (Boolean(await isSuperUser?.(req)) ||
          includesID((await myTenants(req)).admin, data?.[tenantField])),
      update: superUserOr(isSuperUser, inTenants(tenantField, { role: 'admin' })),
      delete: superUserOr(isSuperUser, async ({ req }) => {
        if (!req.user) return false;
        const admin = await inTenants(tenantField, { role: 'admin' })({ req });

        const only = requestTenant?.(req);
        const self: Where = { user: { equals: req.user.id } };
        const leave: Where =
          only === undefined ? self : { and: [self, { [tenantField]: { equals: only } }] };

        return admin && { or: [admin, leave] };
      }),
    },
    indexes: [{ fields: [tenantField, 'email'], unique: true }],
    hooks: {
      beforeOperation: [
        async ({ args, collection, operation, overrideAccess, req }) => {
          if (req.context[handingOver] === true) return args;
          const byID = 'id' in args && args.id;
          const bulk = 'where' in args && args.where && !byID;
          const role = operation === 'update' ? args.data?.role : undefined;

          if (role === 'owner') throw refuse(ownerMessages.onlyByHandover(noun, handover), 400);
          if (!(byID || bulk) || !(operation === 'delete' || role !== undefined)) {
            return args;
          }

          let where: Where = byID
            ? { id: { equals: args.id } }
            : 'where' in args
              ? (args.where as Where)
              : {};

          if (!overrideAccess) {
            if (!req.user) return args;
            const access = await collection.access[operation === 'delete' ? 'delete' : 'update']?.({
              req: toPayloadRequest(req),
              slug: collection.slug,
            });

            if (!access) return args;
            if (access !== true) where = { and: [where, access] };
          }

          const rows = await rowsOf(req, where);

          for (const tenant of new Set(rows.map((row) => relationID(row[tenantField])))) {
            await lockTenant(req, tenant, tenantsSlug);
          }

          if (req.context[deletingTenant] !== true) {
            if (operation === 'delete' && !overrideAccess) await guardLastMember(req, rows);
            const changed = role === undefined ? rows : rows.filter((row) => row.role !== role);
            await guardOwnerRows(req, changed, Boolean(overrideAccess));
          }

          return args;
        },
      ],
      beforeValidate: [
        ({ data }) => {
          if (typeof data?.email === 'string') {
            data.email = data.email.trim().toLowerCase();
          }

          return data;
        },
      ],
      beforeChange: [
        async ({ data, operation, req }) => {
          if (operation === 'create' && req.context[handingOver] !== true) {
            await guardNewOwner(req, data);
          }

          return data;
        },
        async ({ data, operation, req }) => {
          if (operation !== 'create' || data.user || typeof data.email !== 'string') {
            return data;
          }

          const { docs } = await req.frogbot.find({
            collection: authCollection,
            where: { email: { equals: data.email } },
            depth: 0,
            limit: 1,
            overrideAccess: true,
            req,
          });

          if (docs[0]) data.user = docs[0].id;

          return data;
        },
      ],
      afterChange: [
        async ({ doc, previousDoc, req }) => {
          const touchesOwner = doc.role === 'owner' || previousDoc?.role === 'owner';
          if (touchesOwner && req.context[handingOver] !== true) {
            await keepOneOwner(req, doc[tenantField], options, noun);
          }

          forgetTenants(req);

          return doc;
        },
      ],
      afterDelete: [
        async ({ doc, req }) => {
          if (doc.role === 'owner' && req.context[deletingTenant] !== true) {
            await keepOneOwner(req, doc[tenantField], options, noun);
          }

          forgetTenants(req);

          return doc;
        },
      ],
    },
    fields: [
      {
        name: tenantField,
        type: 'relationship',
        relationTo: tenantsSlug,
        required: true,
        index: true,
        access: { update: never },
      },
      {
        name: 'email',
        type: 'email',
        required: true,
        access: { update: never },
      },
      {
        name: 'user',
        type: 'relationship',
        relationTo: authCollection,
        index: true,
        access: { create: never, update: never },
        admin: { readOnly: true },
      },
      {
        name: 'role',
        type: 'select',
        options: [...tenantRoles],
        defaultValue: 'viewer',
        required: true,
      },
    ],
  };

  return mergeCollection(base, options.members);
}
