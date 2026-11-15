'use client';

import './Notifications.css';

import { SetStepNav, toast, useConfig, useRouter } from '@frogbotai/ui/admin';
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
  items: InboxItem[];
  /** The notifications collection's slug. */
  slug: string;
};

const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Notifications, newest first. Opening one marks it read, then follows its link. */
export function Inbox({ items, slug }: InboxProps) {
  const { config } = useConfig();
  const router = useRouter();
  const [read, setRead] = useState(() => new Set<InboxItem['id']>());

  const open = async (item: InboxItem) => {
    if (!item.readAt && !read.has(item.id)) {
      const response = await fetch(`${config.routes.api}/${slug}/${item.id}`, {
        body: JSON.stringify({ readAt: new Date().toISOString() }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      });

      if (!response.ok) {
        toast.error('The notification could not be marked as read.');

        return;
      }

      setRead((previous) => new Set(previous).add(item.id));
    }

    const link = item.link ?? '';

    if (/^\/(?!\/)/.test(link)) router.push(link);
    else if (/^https?:\/\//i.test(link)) window.location.assign(link);
    else router.refresh();
  };

  const steps = <SetStepNav nav={[{ label: 'Notifications' }]} />;

  if (!items.length) {
    return (
      <>
        {steps}
        <p className="fb-inbox__empty">No notifications yet.</p>
      </>
    );
  }

  return (
    <>
      {steps}
      <ol className="fb-inbox">
        {items.map((item) => {
          const unread = !item.readAt && !read.has(item.id);

          return (
            <li key={item.id}>
              <button
                className={`fb-inbox__item${unread ? ' fb-inbox__item--unread' : ''}`}
                onClick={() => void open(item)}
                type="button"
              >
                <span className="fb-inbox__title">
                  {unread ? <span className="fb-inbox__dot" aria-label="Unread" /> : null}
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
    </>
  );
}
