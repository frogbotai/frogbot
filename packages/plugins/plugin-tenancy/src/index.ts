import { definePlugin, type Plugin } from 'frogbot';

import { registerTenancy } from './access.js';
import { membersCollection } from './collections/members.js';
import { tenantsCollection } from './collections/tenants.js';
import { afterSignIn } from './hooks/afterSignIn.js';
import type { TenancyPluginOptions, TenancyResolvedOptions } from './types.js';

export {
  adminsTenant,
  forgetTenants,
  inTenants,
  myTenants,
  ownsTenant,
  roleAtLeast,
  tenantRole,
} from './access.js';
export {
  deletingTenant,
  type HandOverResult,
  handOverTenant,
  ownerMessages,
} from './collections/owner.js';
export { personalTenantName } from './hooks/afterSignIn.js';
export type {
  AssignableRole,
  PersonalTenantOptions,
  TenancyPluginOptions,
  TenancyResolvedOptions,
  TenantID,
  TenantMemberships,
  TenantRole,
  TenantUser,
} from './types.js';
export { assignableRoles, tenantRoles } from './types.js';

declare module 'frogbot' {
  interface RegisteredPlugins {
    'plugin-tenancy': TenancyResolvedOptions;
  }
}

const tenancy = definePlugin<TenancyResolvedOptions>({
  slug: 'plugin-tenancy',
  plugin: ({ config, options }) => {
    const { authCollection, tenantsSlug, membersSlug } = options;
    const auth = config.collections.find(({ slug }) => slug === authCollection);

    if (!auth || auth.auth === undefined || auth.auth === false) {
      throw new Error(
        `[plugin-tenancy] Auth collection '${authCollection}' must exist and have auth enabled.`,
      );
    }

    const taken = config.collections.find(({ slug }) => [tenantsSlug, membersSlug].includes(slug));

    if (taken) {
      throw new Error(
        `[plugin-tenancy] Collection '${taken.slug}' already exists; extend it through the plugin's options.`,
      );
    }

    registerTenancy(options);

    const signedIn = {
      ...auth,
      hooks: {
        ...auth.hooks,
        afterLogin: [...(auth.hooks?.afterLogin ?? []), afterSignIn(options)],
      },
    };

    return {
      ...config,
      collections: config.collections.flatMap((collection) =>
        collection === auth
          ? [signedIn, tenantsCollection(options), membersCollection(options)]
          : [collection],
      ),
    };
  },
});

/**
 * Tenants and their members: a user belongs to a tenant through a member row with the role `owner`, `admin`, `editor`
 * or `viewer`. Each tenant has exactly one `owner`, its creator until they hand it over.
 *
 * @example
 * plugins: [tenancyPlugin({ tenantsSlug: 'teams', membersSlug: 'team-members', tenantField: 'team' })]
 */
export function tenancyPlugin(options: TenancyPluginOptions = {}): Plugin {
  const { personalTenant, ...rest } = options;

  return tenancy({
    ...rest,
    authCollection: options.authCollection ?? 'users',
    tenantsSlug: options.tenantsSlug ?? 'tenants',
    membersSlug: options.membersSlug ?? 'members',
    tenantField: options.tenantField ?? 'tenant',
    personalTenant: personalTenant === true ? {} : personalTenant || undefined,
  });
}
