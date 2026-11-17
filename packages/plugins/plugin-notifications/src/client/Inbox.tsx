'use client';

import './Notifications.css';

import { Button, PayloadLink, SetStepNav, toast, useConfig, useRouter } from '@frogbotai/ui/admin';
import { useState } from 'react';

/** A notification as the inbox shows it. */
export type InboxItem = {
  createdAt: string;
  excerpt?: null | string;
  id: number | string;
  link?: null | string;
  readAt?: null | string;
  title: string;
};

/** Props for `Inbox`. */
export type InboxProps = {
  /** Whether `items` is every notification or unread ones only. Default `all`. */
  filter?: 'all' | 'unread';
  items: InboxItem[];
  /** When there are more, the `?limit=` that shows them. */
  more?: number;
  /** The notifications collection's slug. */
  slug: string;
  /** How many are unread in all, for Mark all read. */
  unread?: number;
};

function isAdminPath(link: string, routes: { admin: string; api: string }): boolean {
  const unsafe = (char: string) => char === '\\' || char <= ' ' || char === '\u007f';

  if (Array.from(link).some(unsafe)) return false;

  const within = (route: string) => {
    const base = route.replace(/\/$/, '');
    const rest = link.slice(base.length);

    return link.startsWith(base) && (rest === '' ? base !== '' : /^\/(?!\/)/.test(rest));
  };

  return within(routes.admin) && !within(routes.api);
}

const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Notifications, newest first, with an All and Unread switch and Mark all read. Opening one marks
 * it read, then follows its link. Each control is a URL (`?filter=unread`, `?limit=`), so a custom
 * view can render `Inbox` with its own query.
 */
export function Inbox({ filter = 'all', items, more, slug, unread = 0 }: InboxProps) {
  const { config } = useConfig();
  const router = useRouter();
  const [read, setRead] = useState(() => new Set<InboxItem['id']>());
  const [markedAll, setMarkedAll] = useState<InboxItem[]>();
  const query = (next: { filter?: string; limit?: number }) => {
    const params = new URLSearchParams();

    if (next.filter === 'unread') params.set('filter', 'unread');
    if (next.limit) params.set('limit', String(next.limit));

    return params.size ? `?${params.toString()}` : '?';
  };

  const markRead = (url: string) =>
    fetch(url, {
      body: JSON.stringify({ readAt: new Date().toISOString() }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    });

  const open = async (item: InboxItem) => {
    if (!item.readAt && !read.has(item.id)) {
      const response = await markRead(`${config.routes.api}/${slug}/${item.id}`);

      if (!response.ok) {
        toast.error('The notification could not be marked as read.');

        return;
      }

      setRead((previous) => new Set(previous).add(item.id));
    }

    const link = item.link ?? '';

    if (isAdminPath(link, config.routes)) router.push(link);
    else if (/^https:\/\/[^\\\s]+$/i.test(link)) window.location.assign(link);
    else router.refresh();
  };

  const markAllRead = async () => {
    const response = await markRead(
      `${config.routes.api}/${slug}?where[readAt][exists]=false&limit=0`,
    );

    if (!response.ok) {
      toast.error('Notifications could not be marked as read.');

      return;
    }

    setRead((previous) => new Set([...previous, ...items.map((item) => item.id)]));
    setMarkedAll(items);
    router.refresh();
  };

  const tab = (value: 'all' | 'unread', label: string) => (
    <PayloadLink
      aria-current={filter === value ? 'page' : undefined}
      className={`fb-inbox__tab${filter === value ? ' fb-inbox__tab--active' : ''}`}
      href={query({ filter: value })}
    >
      {label}
    </PayloadLink>
  );

  return (
    <>
      <SetStepNav nav={[{ label: 'Notifications' }]} />
      <div className="fb-inbox__toolbar">
        <nav aria-label="Show" className="fb-inbox__tabs">
          {tab('all', 'All')}
          {tab('unread', unread ? `Unread (${unread})` : 'Unread')}
        </nav>
        {unread && markedAll !== items ? (
          <Button
            buttonStyle="secondary"
            margin={false}
            onClick={() => void markAllRead()}
            size="medium"
          >
            Mark all read
          </Button>
        ) : null}
      </div>
      {items.length ? (
        <ol className="fb-inbox">
          {items.map((item) => {
            const isUnread = !item.readAt && !read.has(item.id);

            return (
              <li key={item.id}>
                <button
                  className={`fb-inbox__item${isUnread ? ' fb-inbox__item--unread' : ''}`}
                  onClick={() => void open(item)}
                  type="button"
                >
                  <span className="fb-inbox__title">
                    {isUnread ? <span className="fb-inbox__dot" aria-label="Unread" /> : null}
                    {item.title}
                  </span>
                  {item.excerpt ? <span className="fb-inbox__excerpt">{item.excerpt}</span> : null}
                  <time dateTime={item.createdAt} suppressHydrationWarning>
                    {time.format(new Date(item.createdAt))}
                  </time>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="fb-inbox__empty">
          <p className="fb-inbox__empty-title">
            {filter === 'unread' ? 'No unread notifications' : "You're all caught up"}
          </p>
          <p>
            {filter === 'unread' ? (
              <PayloadLink href={query({})}>Show all</PayloadLink>
            ) : (
              'Mentions and updates for you show up here.'
            )}
          </p>
        </div>
      )}
      {more ? (
        <Button
          buttonStyle="secondary"
          el="link"
          margin={false}
          size="medium"
          url={query({ filter, limit: more })}
        >
          Load more
        </Button>
      ) : null}
    </>
  );
}
