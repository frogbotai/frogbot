import type { CollectionAfterLoginHook, FrogBotRequest } from 'frogbot';

import { tenantNoun } from '../collections/utilities.js';
import type { TenancyResolvedOptions, TenantUser } from '../types.js';

/** "Colby's workspace", from the user's first name or else their email; "My workspace" with neither. */
export function personalTenantName(
  { name, email }: Pick<TenantUser, 'email' | 'name'>,
  noun: string,
): string {
  const fromName = typeof name === 'string' ? name.trim().split(/\s+/)[0] : '';
  const fromEmail = typeof email === 'string' ? email.split('@')[0].split(/[._+-]/)[0] : '';
  const first = fromName || fromEmail;

  if (!first) return `My ${noun}`;

  return `${first[0].toUpperCase()}${first.slice(1)}'s ${noun}`;
}

async function ensurePersonalTenant(
  req: FrogBotRequest,
  user: TenantUser,
  options: TenancyResolvedOptions,
): Promise<void> {
  const { membersSlug, tenantsSlug, personalTenant } = options;
  if (!personalTenant || personalTenant.skip?.(user)) return;

  const { totalDocs } = await req.frogbot.count({
    collection: personalTenant.own ? tenantsSlug : membersSlug,
    where: personalTenant.own?.(user) ?? { user: { equals: user.id } },
    overrideAccess: true,
    req,
  });

  if (totalDocs > 0) return;

  const name = personalTenant.name?.(user) ?? personalTenantName(user, tenantNoun(options));

  await req.frogbot.create({
    collection: tenantsSlug,
    data: { ...personalTenant.data?.(user), name },
    overrideAccess: true,
    req,
  });
}

/** Claims the invites waiting for the user's email, then makes their own tenant when they have none. */
export function afterSignIn(options: TenancyResolvedOptions): CollectionAfterLoginHook {
  return async ({ user, req }) => {
    await req.frogbot.update({
      collection: options.membersSlug,
      where: { email: { equals: user.email }, user: { exists: false } },
      data: { user: user.id },
      overrideAccess: true,
      req,
    });

    await ensurePersonalTenant(req, user as TenantUser, options);

    return user;
  };
}
