import type { CollectionConfig, Field, FrogbotConfig, Plugin } from 'frogbot';
import { formatLabels, type Field as PayloadField } from 'payload';

import { allow, bindCompiledAccess, compiledAccess, isCompiledAccess } from './allow.js';
import { attachRoleResolver, defaultRoleResolver, resolveRequestRoles } from './resolve.js';
import { normalizeRoles } from './types.js';
import type { RoleResolver, RolesPluginOptions } from './types.js';

export { RESERVED_ROLE_SLUGS } from './types.js';
export { allow } from './allow.js';
export { hasRole, isLoggedIn, ownRows, rolesOf, viaApiKey } from './predicates.js';
export type {
  Clause,
  ClauseFunction,
  OwnClause,
  RoleClause,
  RoleEntry,
  RoleResolver,
  RoleSlug,
  RolesPluginOptions,
} from './types.js';

function bindFields(fields: PayloadField[], roles: ReadonlySet<string>, resolver: RoleResolver, authCollection: boolean): PayloadField[] {
  return fields.map((field) => {
    let next = field;
    const generatedRolesField = authCollection && 'name' in next && next.name === 'roles';
    if ('access' in next && next.access) {
      const access = Object.fromEntries(Object.entries(next.access).map(([operation, value]) => {
        if (!isCompiledAccess(value)) return [operation, value];
        if (!generatedRolesField) {
          for (const clause of value[compiledAccess].clauses) {
            const role = typeof clause === 'string' ? clause : typeof clause === 'object' ? clause.role : undefined;
            if (role && !roles.has(role)) throw new Error(`[plugin-roles] Role '${role}' is not listed in rolesPlugin().`);
          }
        }
        return [operation, bindCompiledAccess(value, { operation, polymorphicOwnFields: new Set(), resolver, roles })];
      }));
      next = { ...next, access } as PayloadField;
    }
    if ('fields' in next && Array.isArray(next.fields)) next = { ...next, fields: bindFields(next.fields, roles, resolver, false) } as PayloadField;
    if ('tabs' in next && Array.isArray(next.tabs)) {
      next = { ...next, tabs: next.tabs.map((tab) => ({ ...tab, fields: bindFields(tab.fields, roles, resolver, false) })) } as PayloadField;
    }
    return next;
  });
}

function bindAccess(config: FrogbotConfig, roleSlugs: readonly string[], resolver: RoleResolver): FrogbotConfig {
  const listed = new Set(roleSlugs);
  const collections = config.collections.map((collection) => {
    const fields = namedFields(collection.fields as unknown as PayloadField[]);
    const access = collection.access ? Object.fromEntries(Object.entries(collection.access).map(([operation, value]) => {
      if (!isCompiledAccess(value)) return [operation, value];
      for (const clause of value[compiledAccess].clauses) {
        const role = typeof clause === 'string' ? clause : typeof clause === 'object' ? clause.role : undefined;
        if (role && !listed.has(role)) throw new Error(`[plugin-roles] Role '${role}' is not listed in rolesPlugin().`);
      }
      const polymorphicOwnFields = new Set(value[compiledAccess].clauses.flatMap((clause) => {
        if (typeof clause !== 'object') return [];
        const field = fields.find(({ name }) => name === clause.own);
        return field?.type === 'relationship' && Array.isArray(field.relationTo) ? [clause.own] : [];
      }));
      return [operation, bindCompiledAccess(value, { operation, polymorphicOwnFields, resolver, roles: listed })];
    })) : undefined;
    const create = collection.access?.create;
    const own = isCompiledAccess(create)
      ? create[compiledAccess].clauses.filter((clause) => typeof clause === 'object')
      : [];
    const boundFields = bindFields(collection.fields as unknown as PayloadField[], listed, resolver, collection.slug === 'users') as unknown as Field[];
    if (own.length === 0) return { ...collection, access, fields: boundFields };
    const stamp: NonNullable<NonNullable<CollectionConfig['hooks']>['beforeChange']>[number] = ({ data, operation, req }) => {
      if (operation !== 'create' || !req.user) return data;
      const assigned = resolveRequestRoles(req, resolver);
      return own.reduce((next, clause) => listed.has(clause.role) && assigned.includes(clause.role)
        ? { ...next, [clause.own]: req.user!.id }
        : next, data);
    };
    return {
      ...collection,
      access,
      fields: boundFields,
      hooks: { ...collection.hooks, beforeChange: [...(collection.hooks?.beforeChange ?? []), stamp] },
    };
  });
  return { ...config, collections };
}

function distance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let previous = row[0]!;
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const current = row[rightIndex]!;
      row[rightIndex] = Math.min(
        row[rightIndex]! + 1,
        row[rightIndex - 1]! + 1,
        previous + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[right.length]!;
}

function namedFields(fields: PayloadField[]): Array<PayloadField & { name: string }> {
  const result: Array<PayloadField & { name: string }> = [];
  for (const field of fields) {
    if ('name' in field) result.push(field as PayloadField & { name: string });
    if ('fields' in field && Array.isArray(field.fields)) result.push(...namedFields(field.fields));
    if ('tabs' in field && Array.isArray(field.tabs)) {
      for (const tab of field.tabs) result.push(...namedFields(tab.fields));
    }
  }
  return result;
}

function validateCompiledAccess(config: FrogbotConfig, roleSlugs: readonly string[]): void {
  const authSlug = 'users';
  for (const collection of config.collections) {
    const fields = namedFields(collection.fields as unknown as PayloadField[]);
    for (const value of Object.values(collection.access ?? {})) {
      if (!isCompiledAccess(value)) continue;
      for (const clause of value[compiledAccess].clauses) {
        if (typeof clause !== 'object') continue;
        if (clause.own === 'id') {
          if (collection.slug !== authSlug) {
            throw new Error(`[plugin-roles] own field 'id' is only valid on the '${authSlug}' auth collection.`);
          }
          continue;
        }
        const field = fields.find(({ name }) => name === clause.own);
        if (!field || field.type !== 'relationship') {
          const nearest = fields.map(({ name }) => name).sort((a, b) => distance(a, clause.own) - distance(b, clause.own))[0];
          throw new Error(`[plugin-roles] own field '${clause.own}' on '${collection.slug}' must be a relationship to '${authSlug}'${nearest ? `; did you mean '${nearest}'?` : '.'}`);
        }
        const targets = Array.isArray(field.relationTo) ? field.relationTo : [field.relationTo];
        if (!targets.includes(authSlug)) {
          throw new Error(`[plugin-roles] own field '${clause.own}' on '${collection.slug}' must target '${authSlug}'.`);
        }
      }
    }
    for (const field of fields) {
      if (collection.slug === authSlug && field.name === 'roles') continue;
      if (!('access' in field) || !field.access) continue;
      for (const value of Object.values(field.access)) {
        if (!isCompiledAccess(value)) continue;
        for (const clause of value[compiledAccess].clauses) {
          const role = typeof clause === 'string' ? clause : typeof clause === 'object' ? clause.role : undefined;
          if (role && !roleSlugs.includes(role)) throw new Error(`[plugin-roles] Role '${role}' is not listed in rolesPlugin().`);
        }
        if (value[compiledAccess].clauses.some((clause) => typeof clause === 'object')) {
          throw new Error(`[plugin-roles] own clauses cannot be used in field access for '${field.name}'.`);
        }
      }
    }
  }
}

export function rolesPlugin(options: RolesPluginOptions = {}): Plugin {
  const roles = normalizeRoles(options.roles ?? []);
  if (roles.length === 0) return (config) => config;

  return (config) => {
    const resolver = options.resolveRoles ?? defaultRoleResolver;
    const authSlug = 'users';
    const fieldName = 'roles';
    const authCollection = config.collections.find(({ slug }) => slug === authSlug);
    if (!authCollection || authCollection.auth === undefined || authCollection.auth === false) {
      throw new Error(`[plugin-roles] Auth collection '${authSlug}' must exist and have auth enabled.`);
    }
    if (authCollection.fields.some((field) => 'name' in field && field.name === fieldName)) {
      throw new Error(`[plugin-roles] Auth field '${fieldName}' is already in use.`);
    }

    const hasAdmin = roles.some(({ slug }) => slug === 'admin');
    const field: Field = {
      name: fieldName,
      type: 'select',
      hasMany: true,
      options: roles.map(({ slug, label }) => ({ label: label ?? formatLabels(slug).singular, value: slug })),
      admin: { position: 'sidebar' },
      access: { update: allow('admin') },
    };
    const assignFirstUser: NonNullable<NonNullable<CollectionConfig['hooks']>['beforeChange']>[number] = async ({ data, operation, req }) => {
      if (!hasAdmin || operation !== 'create' || data[fieldName] !== undefined) return data;
      const users = await req.frogbot.count({ collection: authSlug as never, overrideAccess: true, req });
      if (users.totalDocs !== 0) return data;
      return { ...data, [fieldName]: ['admin'] };
    };
    const collections = config.collections.map((collection) => collection.slug !== authSlug ? collection : {
      ...collection,
      fields: [...collection.fields, field],
      hooks: {
        ...collection.hooks,
        beforeChange: [...(collection.hooks?.beforeChange ?? []), assignFirstUser],
      },
    });

    const previousOnInit = config.onInit;
    const roleSlugs = roles.map(({ slug }) => slug);
    const onInit: FrogbotConfig['onInit'] = async (frogbot) => {
      await previousOnInit?.(frogbot);
      attachRoleResolver(frogbot, resolver);
      const stale = new Set<string>();
      let page = 1;
      do {
        const result = await frogbot.find({ collection: authSlug as never, limit: 100, overrideAccess: true, page });
        for (const doc of result.docs) {
          const assigned = (doc as { [key: string]: unknown })[fieldName];
          if (!Array.isArray(assigned)) continue;
          for (const role of assigned) if (typeof role === 'string' && !roleSlugs.includes(role)) stale.add(role);
        }
        if (!result.hasNextPage) break;
        page = result.nextPage ?? page + 1;
      } while (true);
      if (stale.size > 0) frogbot.logger.warn(`[plugin-roles] Stored assignments reference unlisted roles: ${[...stale].join(', ')}.`);
    };
    const result = { ...config, collections, onInit } as FrogbotConfig;
    validateCompiledAccess(result, roleSlugs);
    return bindAccess(result, roleSlugs, resolver);
  };
}
