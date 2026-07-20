// Derive the user collection slug from the config (design §3):
//   - zero `auth: true` collections → Payload injects its default `users`
//   - exactly one → it is the user collection, regardless of slug
//   - multiple → `admin.user` must pick one, otherwise throw

import type { FrogbotConfig } from '../types/config.js';

export function resolveUserSlug(config: Pick<FrogbotConfig, 'collections' | 'admin'>): string {
  const authSlugs = config.collections
    .filter((c) => c.auth !== undefined && c.auth !== false)
    .map((c) => c.slug);

  if (authSlugs.length === 0) {
    return 'users';
  }
  if (authSlugs.length === 1) {
    return authSlugs[0];
  }

  const adminUser = config.admin?.user;
  if (adminUser === undefined) {
    throw new Error(
      `[frogbot] Multiple auth collections found (${authSlugs.join(', ')}). ` +
        'Set `admin.user` to the slug of your user collection.',
    );
  }
  if (!authSlugs.includes(adminUser)) {
    throw new Error(
      `[frogbot] \`admin.user\` is '${adminUser}' but no auth collection has that slug ` +
        `(found: ${authSlugs.join(', ')}).`,
    );
  }
  return adminUser;
}
