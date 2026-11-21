import type { CollectionConfig, Field, FrogBotRequest, Where } from 'frogbot';
import { formatLabels } from 'payload';

import type { TenancyResolvedOptions } from '../types.js';

export const never = () => false;

type ScopedAccess = (args: { req: FrogBotRequest }) => boolean | Where | Promise<boolean | Where>;

export function superUserOr(
  isSuperUser: TenancyResolvedOptions['isSuperUser'],
  access: ScopedAccess,
): ScopedAccess {
  if (!isSuperUser) return access;

  return async (args) => (await isSuperUser(args.req)) || access(args);
}

/** The tenants collection's singular label in lower case: "workspace" for `workspaces`. */
export function tenantNoun({ tenants, tenantsSlug }: TenancyResolvedOptions): string {
  const singular = tenants?.labels?.singular;

  return (
    typeof singular === 'string' ? singular : formatLabels(tenantsSlug).singular
  ).toLowerCase();
}

const fieldKey = (field: Field) =>
  'name' in field && field.name ? field.name : JSON.stringify(field);

function mergeFields(base: Field[], extra: Field[] = [], trailing: Field[] = []): Field[] {
  const fields = new Map<string, Field>();

  for (const field of [...base, ...extra]) fields.set(fieldKey(field), field);

  for (const field of trailing) {
    if (!fields.has(fieldKey(field))) fields.set(fieldKey(field), field);
  }

  return [...fields.values()];
}

function mergeHooks(
  base: CollectionConfig['hooks'] = {},
  extra: CollectionConfig['hooks'] = {},
): CollectionConfig['hooks'] {
  const hooks: Record<string, unknown[]> = { ...base };

  for (const [name, list] of Object.entries(extra)) {
    hooks[name] = [...(hooks[name] ?? []), ...(list as unknown[])];
  }

  return hooks as CollectionConfig['hooks'];
}

/** The plugin's collection with the app's additions: fields added or replaced by name, hooks after the plugin's, access per operation. */
export function mergeCollection(
  base: CollectionConfig,
  extra: Partial<CollectionConfig> = {},
  trailingFields: Field[] = [],
): CollectionConfig {
  return {
    ...base,
    ...extra,
    slug: base.slug,
    admin: { ...base.admin, ...extra.admin },
    access: { ...base.access, ...extra.access },
    hooks: mergeHooks(base.hooks, extra.hooks),
    fields: mergeFields(base.fields, extra.fields, trailingFields),
  };
}
