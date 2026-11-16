import { DefaultTemplate } from '@frogbotai/ui/admin/rsc';
import { attachRegisteredFrogBot } from 'frogbot/internal';
import type { AdminViewServerProps } from 'payload';

import { Inbox, type InboxItem } from '../client/Inbox.js';
import { INBOX_LIMIT, INBOX_MAX, inboxLimit, notificationsCustomKey } from '../shared.js';
import type { NotificationsConfig } from '../types.js';

function param(value: unknown): string | undefined {
  return typeof value === 'string' ? value : Array.isArray(value) ? String(value[0]) : undefined;
}

/**
 * The inbox at `/admin/notifications`: the signed-in user's notifications, newest first, read with
 * their own access. `?filter=unread` shows unread ones only, and `?limit=` how many.
 */
export async function InboxView(props: AdminViewServerProps) {
  const { initPageResult, params, payload, searchParams } = props;
  const { req } = initPageResult;
  const options = payload.config.custom?.[notificationsCustomKey] as
    NotificationsConfig | undefined;

  const filter = param(searchParams?.filter) === 'unread' ? 'unread' : 'all';
  const limit = inboxLimit(param(searchParams?.limit));
  const slug = options && req.user?.collection === options.userSlug ? options.slug : undefined;
  const mine = { user: { equals: req.user?.id } };
  const unreadOnly = { readAt: { exists: false } };

  const [page, unread] = slug
    ? await Promise.all([
        payload
          .find({
            collection: slug,
            depth: 0,
            limit,
            overrideAccess: false,
            req,
            sort: '-createdAt',
            where: filter === 'unread' ? { and: [mine, unreadOnly] } : mine,
          })
          .catch(() => ({ docs: [], hasNextPage: false })),
        payload
          .count({
            collection: slug,
            overrideAccess: false,
            req,
            where: { and: [mine, unreadOnly] },
          })
          .then((result) => result.totalDocs)
          .catch(() => 0),
      ])
    : [{ docs: [], hasNextPage: false }, 0];

  const items: InboxItem[] = page.docs.map((doc) => ({
    createdAt: String(doc.createdAt),
    excerpt: doc.excerpt as InboxItem['excerpt'],
    id: doc.id,
    link: doc.link as InboxItem['link'],
    readAt: doc.readAt as InboxItem['readAt'],
    title: String(doc.title),
  }));

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
        <Inbox
          filter={filter}
          items={items}
          more={
            page.hasNextPage && limit < INBOX_MAX
              ? Math.min(INBOX_MAX, limit + INBOX_LIMIT)
              : undefined
          }
          slug={options?.slug ?? ''}
          unread={unread}
        />
      </div>
    </DefaultTemplate>
  );
}
