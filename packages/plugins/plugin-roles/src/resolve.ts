import type { FrogBotConfig, FrogBotRequest } from 'frogbot';

import type { RoleResolver, RoleSlug } from './types.js';

const resolvedRoles = Symbol('frogbot.roles');
const configuredResolver = Symbol('frogbot.roleResolver');

type RequestWithRoles = FrogBotRequest & {
  [resolvedRoles]?: Map<RoleResolver, RoleSlug[]>;
};

type CustomWithResolver = {
  [configuredResolver]?: RoleResolver;
};

export const defaultRoleResolver: RoleResolver = (req) => {
  const roles = (req.user as { roles?: unknown } | null)?.roles;

  return Array.isArray(roles)
    ? roles.filter((role): role is RoleSlug => typeof role === 'string')
    : [];
};

export function withRoleResolver(
  custom: FrogBotConfig['custom'],
  resolver: RoleResolver,
): NonNullable<FrogBotConfig['custom']> {
  return { ...custom, [configuredResolver]: resolver };
}

export function resolverForRequest(req: FrogBotRequest): RoleResolver {
  const custom = req.frogbot?.config?.custom as CustomWithResolver | undefined;

  return custom?.[configuredResolver] ?? defaultRoleResolver;
}

export function resolveRequestRoles(
  req: FrogBotRequest,
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
