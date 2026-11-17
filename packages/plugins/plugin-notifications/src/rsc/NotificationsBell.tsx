import { BellIcon } from '@frogbotai/ui/icons';

import { BellLink } from '../client/BellLink.js';
import { notificationsCustomKey } from '../shared.js';
import type { NotificationsConfig } from '../types.js';

type BellPayload = {
  config: { custom?: Record<string, unknown>; routes: { admin: string } };
  count: (args: {
    collection: string;
    overrideAccess: false;
    req: unknown;
    where: Record<string, unknown>;
  }) => Promise<{ totalDocs: number }>;
};

/** The server props Payload gives a header action that the bell reads. */
export type NotificationsBellProps = {
  payload?: BellPayload;
  req?: unknown;
  user?: { collection?: string; id: number | string } | null;
};

/**
 * The admin header's bell: links to the inbox and shows how many notifications are unread. It is
 * a server component, so the count is read again on every page change.
 */
export async function NotificationsBell({ payload, req, user }: NotificationsBellProps) {
  const options = payload?.config.custom?.[notificationsCustomKey] as
    NotificationsConfig | undefined;

  if (!payload || !options || !user || user.collection !== options.userSlug) return null;

  const { totalDocs } = await payload
    .count({
      collection: options.slug,
      overrideAccess: false,
      req,
      where: { and: [{ user: { equals: user.id } }, { readAt: { exists: false } }] },
    })
    .catch(() => ({ totalDocs: 0 }));

  return (
    <BellLink adminRoute={payload.config.routes.admin} unread={totalDocs}>
      <BellIcon aria-hidden size={16} />
    </BellLink>
  );
}
