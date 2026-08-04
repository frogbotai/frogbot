import type { Access, AgentAccess, FieldAccess, FrogbotRequest } from 'frogbot';

export type RoleGrantScope = 'any' | 'own';

export type RoleGrant = {
  resource: string;
  actions: readonly string[];
  scope?: RoleGrantScope;
};

export type Role = {
  slug: string;
  name: string;
  description?: string;
  grants: readonly RoleGrant[];
};

export type CanOptions = {
  ownerField?: string;
};

type Permission = {
  resource: string;
  action: string;
};

function parsePermission(value: string): Permission {
  const separator = value.lastIndexOf(':');
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`[plugin-roles] Invalid permission '${value}'. Expected 'resource:action'.`);
  }
  return { resource: value.slice(0, separator), action: value.slice(separator + 1) };
}

function populatedRoles(req: FrogbotRequest): Role[] {
  const value = (req.user as { roles?: unknown } | null)?.roles;
  if (!Array.isArray(value)) return [];
  return value.filter((role): role is Role => {
    if (!role || typeof role !== 'object') return false;
    const candidate = role as Partial<Role>;
    return typeof candidate.slug === 'string' && Array.isArray(candidate.grants);
  });
}

function grantScope(req: FrogbotRequest, permission: Permission): RoleGrantScope | undefined {
  let own = false;
  for (const role of populatedRoles(req)) {
    for (const grant of role.grants) {
      const resourceMatches = grant.resource === '*' || grant.resource === permission.resource;
      const actionMatches = grant.actions.includes('*') || grant.actions.includes(permission.action);
      if (!resourceMatches || !actionMatches) continue;
      if ((grant.scope ?? 'any') === 'any') return 'any';
      own = true;
    }
  }
  return own ? 'own' : undefined;
}

export function can(permissionValue: string, options: CanOptions = {}): Access {
  const permission = parsePermission(permissionValue);
  return ({ req }) => {
    const scope = grantScope(req, permission);
    if (scope === 'any') return true;
    if (scope !== 'own' || !req.user) return false;
    return { [options.ownerField ?? 'user']: { equals: req.user.id } };
  };
}

export function canField(permissionValue: string): FieldAccess {
  const permission = parsePermission(permissionValue);
  return ({ req }) => grantScope(req, permission) !== undefined;
}

export function canAgent(permissionValue: string): AgentAccess {
  const permission = parsePermission(permissionValue);
  return ({ req }) => grantScope(req, permission) !== undefined;
}
