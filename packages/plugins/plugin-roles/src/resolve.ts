import type { FrogbotRequest } from 'frogbot';

import type { RoleResolver, RoleSlug } from './types.js';

const resolvedRoles = Symbol('frogbot.roles');
const configuredResolver = Symbol('frogbot.roleResolver');

type RequestWithRoles = FrogbotRequest & {
  [resolvedRoles]?: Map<RoleResolver, RoleSlug[]>;
};

type FrogbotWithResolver = object & {
  [configuredResolver]?: RoleResolver;
};

export const defaultRoleResolver: RoleResolver = (req) => {
  const roles = (req.user as { roles?: unknown } | null)?.roles;
  return Array.isArray(roles)
    ? (roles.filter((role): role is string => typeof role === 'string') as RoleSlug[])
    : [];
};

export function attachRoleResolver(frogbot: object, resolver: RoleResolver): void {
  Object.defineProperty(frogbot, configuredResolver, { configurable: true, value: resolver });
}

export function resolverForRequest(req: FrogbotRequest): RoleResolver {
  return (
    (req.frogbot as FrogbotWithResolver | undefined)?.[configuredResolver] ?? defaultRoleResolver
  );
}

export function resolveRequestRoles(
  req: FrogbotRequest,
  resolver = resolverForRequest(req),
): RoleSlug[] {
  const request = req as RequestWithRoles;
  request[resolvedRoles] ??= new Map();
  const cached = request[resolvedRoles].get(resolver);
  if (cached) return cached;
  const roles = resolver(req);
  request[resolvedRoles].set(resolver, roles);
  return roles;
}
