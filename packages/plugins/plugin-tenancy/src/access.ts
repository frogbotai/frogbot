import type { FrogBotRequest, Where } from 'frogbot';

import {
  type TenancyResolvedOptions,
  type TenantID,
  type TenantMemberships,
  type TenantRole,
  tenantRoles,
} from './types.js';

const registryKey = Symbol.for('frogbot.plugin-tenancy');
const cacheKey = 'pluginTenancyMemberships';

type Registry = { [registryKey]?: TenancyResolvedOptions };

export function registerTenancy(options: TenancyResolvedOptions): void {
  (globalThis as Registry)[registryKey] = options;
}

export function tenancyOptions(): TenancyResolvedOptions {
  const options = (globalThis as Registry)[registryKey];

  if (!options) {
    throw new Error('[plugin-tenancy] tenancyPlugin() is not in the config.');
  }

  return options;
}

export function relationID(value: unknown): string | undefined {
  if (value && typeof value === 'object' && 'id' in value) {
    return relationID(value.id);
  }

  if (typeof value === 'number' || (typeof value === 'string' && value)) {
    return String(value);
  }

  return undefined;
}

export function includesID(ids: TenantID[], value: unknown): boolean {
  const id = relationID(value);

  return id !== undefined && ids.some((candidate) => String(candidate) === id);
}

/**
 * The tenants the signed-in user is a member of (`all`), edits (`editable`: editor and up), admins (`admin`: admin or
 * owner) and owns (`owner`), read once per request. A request limited to one tenant (`requestTenant`) gets that one at most.
 *
 * @example
 * const { all } = await myTenants(req);
 */
export function myTenants(req: FrogBotRequest): Promise<TenantMemberships> {
  const user = req.user;
  if (!user) return Promise.resolve({ all: [], editable: [], admin: [], owner: [] });

  const cached = req.context[cacheKey] as Promise<TenantMemberships> | undefined;
  if (cached) return cached;

  const { membersSlug, tenantField, requestTenant } = tenancyOptions();
  const only = requestTenant?.(req);

  const memberships = req.frogbot
    .find({
      collection: membersSlug,
      where: {
        user: { equals: user.id },
        ...(only === undefined ? {} : { [tenantField]: { equals: only } }),
      },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    })
    .then(({ docs }) => {
      const rows = docs.map((doc): Record<string, unknown> => ({ ...doc }));
      const withRole = (roles: TenantRole[]) =>
        rows.flatMap((row) =>
          roles.includes(row.role as TenantRole) ? (relationID(row[tenantField]) ?? []) : [],
        );

      return {
        all: rows.flatMap((row) => relationID(row[tenantField]) ?? []),
        editable: withRole(['editor', 'admin', 'owner']),
        admin: withRole(['admin', 'owner']),
        owner: withRole(['owner']),
      };
    });

  req.context[cacheKey] = memberships;

  return memberships;
}

/** Drops the request's memberships, so the next `myTenants` reads them again after a change. */
export function forgetTenants(req: FrogBotRequest): void {
  delete req.context[cacheKey];
}

/** The signed-in user's role in the tenant, given its ID or the document, or `null` outside it. */
export async function tenantRole(req: FrogBotRequest, tenant: unknown): Promise<TenantRole | null> {
  const memberships = await myTenants(req);
  if (includesID(memberships.owner, tenant)) return 'owner';
  if (includesID(memberships.admin, tenant)) return 'admin';
  if (includesID(memberships.editable, tenant)) return 'editor';
  if (includesID(memberships.all, tenant)) return 'viewer';

  return null;
}

/** Whether `role` is `least` or above it, such as an owner for `admin`. */
export function roleAtLeast(role: TenantRole | null | undefined, least: TenantRole): boolean {
  return (
    role !== null && role !== undefined && tenantRoles.indexOf(role) >= tenantRoles.indexOf(least)
  );
}

/** Whether the signed-in user owns the tenant, given its ID or the document. */
export async function ownsTenant(req: FrogBotRequest, tenant: unknown): Promise<boolean> {
  return includesID((await myTenants(req)).owner, tenant);
}

/** Whether the signed-in user is an admin of the tenant, or its owner, given its ID or the document. */
export async function adminsTenant(req: FrogBotRequest, tenant: unknown): Promise<boolean> {
  return includesID((await myTenants(req)).admin, tenant);
}

/**
 * Access for documents whose `field` holds one of the user's tenants, or only those where they hold at least `role`.
 *
 * @example
 * access: { read: inTenants('workspace'), update: inTenants('workspace', { role: 'admin' }) }
 */
export function inTenants(
  field: string,
  { role = 'viewer' }: { role?: TenantRole } = {},
): (args: { req: FrogBotRequest }) => Promise<Where | false> {
  return async ({ req }) => {
    if (!req.user) return false;

    const memberships = await myTenants(req);
    const ids = {
      viewer: memberships.all,
      editor: memberships.editable,
      admin: memberships.admin,
      owner: memberships.owner,
    }[role];

    return { [field]: { in: ids } };
  };
}
