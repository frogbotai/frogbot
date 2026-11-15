import { DefaultTemplate } from '@frogbotai/ui/admin/rsc';
import { attachRegisteredFrogBot } from 'frogbot/internal';
import type { AdminViewServerProps } from 'payload';

import { Inbox, type InboxItem } from '../client/Inbox.js';
import { INBOX_LIMIT, notificationsCustomKey } from '../shared.js';
import type { NotificationsConfig } from '../types.js';

/**
 * The inbox at `/admin/notifications`: the signed-in user's latest notifications, newest first,
 * read with their own access.
 */
export async function InboxView(props: AdminViewServerProps) {
  const { initPageResult, params, payload, searchParams } = props;
  const { req } = initPageResult;
  const options = payload.config.custom?.[notificationsCustomKey] as
    NotificationsConfig | undefined;

  const items: InboxItem[] =
    options && req.user?.collection === options.userSlug
      ? (
          await payload
            .find({
              collection: options.slug,
              depth: 0,
              limit: INBOX_LIMIT,
              overrideAccess: false,
              req,
              sort: '-createdAt',
              where: { user: { equals: req.user.id } },
            })
            .catch(() => ({ docs: [] }))
        ).docs.map((doc) => ({
          createdAt: String(doc.createdAt),
          excerpt: doc.excerpt as InboxItem['excerpt'],
          id: doc.id,
          link: doc.link as InboxItem['link'],
          readAt: doc.readAt as InboxItem['readAt'],
          title: String(doc.title),
        }))
      : [];

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      permissions={initPageResult.permissions}
      req={attachRegisteredFrogBot(req)}
      searchParams={searchParams}
      user={req.user ?? undefined}
      viewActions={payload.config.admin.components?.actions}
      visibleEntities={initPageResult.visibleEntities}
    >
      <div className="gutter--left gutter--right fb-inbox-view">
        <h1 className="fb-inbox-view__title">Notifications</h1>
        <Inbox items={items} slug={options?.slug ?? ''} />
      </div>
    </DefaultTemplate>
  );
}
