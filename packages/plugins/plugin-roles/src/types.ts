import type { AccessArgs, FrogbotRequest } from 'frogbot';
import type { Where } from 'payload';

export type RoleSlug = string;

export type RoleEntry = RoleSlug | {
  slug: RoleSlug;
  label?: string;
};

export const RESERVED_ROLE_SLUGS = ['admin', 'member', 'finance', 'auditor', 'support'] as const;

export type RoleResolver = (req: FrogbotRequest) => RoleSlug[];

export type RolesPluginOptions = {
  roles?: readonly RoleEntry[];
  resolveRoles?: RoleResolver;
};

export type RoleClause = RoleSlug;

export type OwnClause = {
  role: RoleSlug;
  own: string;
};

export type RoleAccessArgs = AccessArgs;

export type ClauseFunction<TArgs extends RoleAccessArgs = RoleAccessArgs, TResult extends boolean | Where = boolean | Where> = (
  args: TArgs,
) => TResult | Promise<TResult>;

export type Clause<TArgs extends RoleAccessArgs = RoleAccessArgs> = RoleClause | OwnClause | ClauseFunction<TArgs>;

export type BooleanClause<TArgs extends RoleAccessArgs = RoleAccessArgs> = RoleClause | ClauseFunction<TArgs, boolean>;

export type NormalizedRole = {
  slug: RoleSlug;
  label?: string;
};

export function normalizeRoles(entries: readonly RoleEntry[]): NormalizedRole[] {
  const roles = entries.map((entry) => typeof entry === 'string' ? { slug: entry } : entry);
  const invalidReserved = roles.find(({ slug }) => {
    const normalized = slug.toLowerCase();
    return RESERVED_ROLE_SLUGS.includes(normalized as (typeof RESERVED_ROLE_SLUGS)[number]) && slug !== normalized;
  });
  if (invalidReserved) throw new Error(`[plugin-roles] Reserved role slug '${invalidReserved.slug}' must be lowercase.`);
  const duplicate = roles.find((role, index) => roles.findIndex(({ slug }) => slug === role.slug) !== index);
  if (duplicate) throw new Error(`[plugin-roles] Duplicate role slug '${duplicate.slug}'.`);
  return roles;
}
