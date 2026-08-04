import type { CollectionConfig, Field, FrogbotConfig, Plugin } from 'frogbot';

import type { Role, RoleGrant } from './access.js';

export { can, canAgent, canField } from './access.js';
export type { CanOptions, Role, RoleGrant, RoleGrantScope } from './access.js';

export type RoleResource = {
  slug: string;
  actions: readonly string[];
};

export type RolesPluginOptions = {
  roles?: readonly Role[];
  resources?: readonly RoleResource[];
  authCollection?: string;
  collectionSlug?: string;
  fieldName?: string;
  adminRole?: string;
  collection?: Partial<CollectionConfig>;
};

export const defaultRoles: readonly Role[] = [
  { slug: 'admin', name: 'Administrator', grants: [{ resource: '*', actions: ['*'] }] },
  {
    slug: 'member',
    name: 'Member',
    grants: [
      { resource: 'agents', actions: ['run'] },
      { resource: 'threads', actions: ['create', 'read', 'update'], scope: 'own' },
      { resource: 'api-keys', actions: ['create', 'read', 'update', 'delete'], scope: 'own' },
      { resource: 'usage-logs', actions: ['read'], scope: 'own' },
    ],
  },
  {
    slug: 'viewer',
    name: 'Viewer',
    grants: [{ resource: 'usage-logs', actions: ['read'], scope: 'own' }],
  },
];

function duplicate(values: readonly string[]): string | undefined {
  return values.find((value, index) => values.indexOf(value) !== index);
}

function validateGrant(grant: RoleGrant, resources: readonly RoleResource[] | undefined): void {
  if (!grant.resource || grant.actions.length === 0) {
    throw new Error('[plugin-roles] Every grant requires a resource and at least one action.');
  }
  if (grant.scope !== undefined && grant.scope !== 'any' && grant.scope !== 'own') {
    throw new Error(`[plugin-roles] Invalid scope '${grant.scope}'.`);
  }
  if (!resources || grant.resource === '*') return;
  const resource = resources.find((item) => item.slug === grant.resource);
  if (!resource) throw new Error(`[plugin-roles] Unknown resource '${grant.resource}'.`);
  const unknown = grant.actions.find((action) => action !== '*' && !resource.actions.includes(action));
  if (unknown) throw new Error(`[plugin-roles] Unknown action '${unknown}' for resource '${grant.resource}'.`);
}

function validate(options: Required<Pick<RolesPluginOptions, 'roles' | 'adminRole'>> & RolesPluginOptions): void {
  const duplicateRole = duplicate(options.roles.map((role) => role.slug));
  if (duplicateRole) throw new Error(`[plugin-roles] Duplicate role slug '${duplicateRole}'.`);
  const duplicateResource = duplicate((options.resources ?? []).map((resource) => resource.slug));
  if (duplicateResource) throw new Error(`[plugin-roles] Duplicate resource slug '${duplicateResource}'.`);
  if (!options.roles.some((role) => role.slug === options.adminRole)) {
    throw new Error(`[plugin-roles] Admin role '${options.adminRole}' is not defined.`);
  }
  for (const role of options.roles) {
    if (!role.slug || !role.name) throw new Error('[plugin-roles] Every role requires a slug and name.');
    for (const grant of role.grants) validateGrant(grant, options.resources);
  }
}

function createRolesCollection(slug: string, collection: Partial<CollectionConfig> | undefined): CollectionConfig {
  const configuredFields = collection?.fields ?? [];
  const reserved = new Set(['slug', 'name', 'description', 'grants']);
  const collision = configuredFields.find((field) => 'name' in field && reserved.has(field.name));
  if (collision && 'name' in collision) throw new Error(`[plugin-roles] Roles collection field '${collision.name}' is reserved.`);
  return {
    ...collection,
    slug,
    admin: { useAsTitle: 'name', group: 'Security', ...collection?.admin },
    access: {
      ...collection?.access,
      create: () => false,
      delete: () => false,
      read: ({ req }) => Boolean(req.user),
      update: () => false,
    },
    fields: [
      { name: 'slug', type: 'text', required: true, unique: true, index: true },
      { name: 'name', type: 'text', required: true },
      { name: 'description', type: 'textarea' },
      { name: 'grants', type: 'json', required: true },
      ...configuredFields,
    ],
  };
}

export function rolesPlugin(input: RolesPluginOptions = {}): Plugin {
  const options = {
    ...input,
    roles: input.roles ?? defaultRoles,
    adminRole: input.adminRole ?? 'admin',
  };
  validate(options);
  return (config) => {
    const authSlug = options.authCollection ?? 'users';
    const collectionSlug = options.collectionSlug ?? 'roles';
    const fieldName = options.fieldName ?? 'roles';
    const authCollection = config.collections.find((collection) => collection.slug === authSlug);
    if (!authCollection || authCollection.auth === undefined || authCollection.auth === false) {
      throw new Error(`[plugin-roles] Auth collection '${authSlug}' must exist and have auth enabled.`);
    }
    if (config.collections.some((collection) => collection.slug === collectionSlug)) {
      throw new Error(`[plugin-roles] Collection slug '${collectionSlug}' is already in use.`);
    }
    if (authCollection.fields.some((field) => 'name' in field && field.name === fieldName)) {
      throw new Error(`[plugin-roles] Auth field '${fieldName}' is already in use.`);
    }
    const roleCollection = createRolesCollection(collectionSlug, options.collection);
    const previousOnInit = config.onInit;
    const collections = config.collections.map((collection) => {
      if (collection.slug !== authSlug) return collection;
      const auth = typeof collection.auth === 'object' ? collection.auth : {};
      const assignFirstUser: NonNullable<NonNullable<CollectionConfig['hooks']>['beforeChange']>[number] = async ({ data, operation, req }) => {
        if (operation !== 'create' || data[fieldName] !== undefined) return data;
        const users = await req.frogbot.count({ collection: authSlug as never, overrideAccess: true, req });
        if (users.totalDocs !== 0) return data;
        const result = await req.frogbot.find({
          collection: collectionSlug as never,
          where: { slug: { equals: options.adminRole } },
          limit: 1,
          overrideAccess: true,
          req,
        });
        const role = result.docs[0];
        if (!role) throw new Error(`[plugin-roles] Admin role '${options.adminRole}' has not been synchronized.`);
        return { ...data, [fieldName]: [role.id] };
      };
      const relationship: Field = {
        name: fieldName,
        type: 'relationship',
        relationTo: collectionSlug,
        hasMany: true,
        admin: { position: 'sidebar' },
      };
      return {
        ...collection,
        auth: { ...auth, depth: Math.max(auth.depth ?? 0, 1) },
        fields: [...collection.fields, relationship],
        hooks: {
          ...collection.hooks,
          beforeChange: [...(collection.hooks?.beforeChange ?? []), assignFirstUser],
        },
      };
    });
    const onInit = async (frogbot: Parameters<NonNullable<FrogbotConfig['onInit']>>[0]) => {
      await previousOnInit?.(frogbot);
      const api = frogbot as unknown as {
        create(args: Record<string, unknown>): Promise<unknown>;
        find(args: Record<string, unknown>): Promise<{ docs: Array<{ id: number | string }> }>;
        update(args: Record<string, unknown>): Promise<unknown>;
      };
      for (const role of options.roles) {
        const existing = await api.find({
          collection: collectionSlug,
          where: { slug: { equals: role.slug } },
          limit: 1,
          overrideAccess: true,
        });
        const data = { slug: role.slug, name: role.name, description: role.description, grants: role.grants };
        if (existing.docs[0]) {
          await api.update({ collection: collectionSlug, id: existing.docs[0].id, data, overrideAccess: true });
        } else {
          await api.create({ collection: collectionSlug, data, overrideAccess: true });
        }
      }
    };
    return {
      ...config,
      collections: [...collections, roleCollection],
      onInit,
    };
  };
}
