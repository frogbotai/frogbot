import type { FrogBotRequest } from 'frogbot';
import type { Where } from 'payload';

import { resolveRequestRoles } from './resolve.js';
import type { RoleSlug } from './types.js';

export function isLoggedIn(req: FrogBotRequest): boolean {
  return Boolean(req.user);
}

export function rolesOf(req: FrogBotRequest): RoleSlug[] {
  return req.user ? resolveRequestRoles(req) : [];
}

export function hasRole(req: FrogBotRequest, ...roles: RoleSlug[]): boolean {
  const assigned = rolesOf(req);
  return roles.some((role) => assigned.includes(role));
}

export function ownRows(req: FrogBotRequest, field: string): Where | false {
  if (!req.user) return false;
  return { [field]: { equals: req.user.id } };
}

export function viaApiKey(req: FrogBotRequest): boolean {
  return (req.user as { _strategy?: string } | null)?._strategy === 'api-key';
}
