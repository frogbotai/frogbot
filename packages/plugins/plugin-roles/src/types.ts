import type { AccessArgs, FieldAccess, FrogbotRequest, RoleSlug } from 'frogbot';
import type { Where } from 'payload';

export type { RoleSlug } from 'frogbot';

export type RoleEntry =
  | string
  | {
      slug: string;
      label?: string;
    };

export type RoleResolver = (req: FrogbotRequest) => RoleSlug[];

export type RolesFieldAccess = {
  create?: FieldAccess;
  read?: FieldAccess;
  update?: FieldAccess;
};

export type RolesPluginOptions = {
  roles?: readonly RoleEntry[];
  defaultRole?: string;
  resolveRoles?: RoleResolver;
  rolesFieldAccess?: RolesFieldAccess;
};

export type RoleClause = RoleSlug;

export type OwnClause = {
  role: RoleSlug;
  own: string;
};

export type RoleAccessArgs = AccessArgs;

export type ClauseFunction<
  TArgs extends RoleAccessArgs = RoleAccessArgs,
  TResult extends boolean | Where = boolean | Where,
> = (args: TArgs) => TResult | Promise<TResult>;

export type Clause<TArgs extends RoleAccessArgs = RoleAccessArgs> =
  RoleClause | OwnClause | ClauseFunction<TArgs>;

export type BooleanClause<TArgs extends RoleAccessArgs = RoleAccessArgs> =
  RoleClause | ClauseFunction<TArgs, boolean>;

export type NormalizedRole = {
  slug: string;
  label?: string;
};

export function normalizeRoles(entries: readonly RoleEntry[]): NormalizedRole[] {
  const roles = entries.map((entry) => (typeof entry === 'string' ? { slug: entry } : entry));
  const duplicate = roles.find(
    (role, index) => roles.findIndex(({ slug }) => slug === role.slug) !== index,
  );
  if (duplicate) throw new Error(`[plugin-roles] Duplicate role slug '${duplicate.slug}'.`);
  return roles;
}
