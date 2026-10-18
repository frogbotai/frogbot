'use client';

import { type ChatDocument, type ChatPlatformAdapter } from '../chat/adapter.js';
import { ChatHistoryActions } from '../chat/chat-history-actions.js';
import { useChats } from '../chat/use-chats.js';
import { useNavAdapter } from './adapter.js';
import { NavItem } from './NavItem.js';

export type RecentChatsProps = {
  adapter: ChatPlatformAdapter;
  /** The chats to show before the first refresh, newest first. */
  recents: ChatDocument[];
  /** The path of one chat. */
  chatPath: (id: ChatDocument['id']) => string;
  /** Where View all goes, and where a deleted open chat leaves to. */
  viewAllPath: string;
};

export const recentBucketLabels = [
  'Today',
  'Yesterday',
  'Previous 7 days',
  'Previous 30 days',
  'Older',
] as const;

type RecentBucketLabel = (typeof recentBucketLabels)[number];

export function bucketRecents(recents: ChatDocument[], now = new Date()) {
  const boundary = (days: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - days).getTime();

  const today = boundary(0);
  const yesterday = boundary(1);
  const previous7Days = boundary(7);
  const previous30Days = boundary(30);
  const buckets = new Map<RecentBucketLabel, ChatDocument[]>();

  for (const recent of recents) {
    const timestamp = recent.lastMessageAt ? new Date(recent.lastMessageAt).getTime() : Number.NaN;
    const label =
      !Number.isFinite(timestamp) || timestamp <= previous30Days
        ? 'Older'
        : timestamp <= previous7Days
          ? 'Previous 30 days'
          : timestamp < yesterday
            ? 'Previous 7 days'
            : timestamp < today
              ? 'Yesterday'
              : 'Today';

    buckets.set(label, [...(buckets.get(label) ?? []), recent]);
  }

  return recentBucketLabels.flatMap((label) => {
    const docs = buckets.get(label);

    return docs ? [{ label, docs }] : [];
  });
}

/** The newest chats in date groups, with row actions and View all, kept fresh over `adapter`. */
export function RecentChats({ adapter, chatPath, recents, viewAllPath }: RecentChatsProps) {
  const { Link, navigate, pathname } = useNavAdapter();
  const chats = useChats({
    adapter,
    limit: 30,
    initialData: {
      docs: recents,
      page: 1,
      totalDocs: recents.length,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
    revalidate: true,
  });

  const docs = chats.docs ?? recents;
  const buckets = bucketRecents(docs);

  return (
    <div className="fb-recent-chats__groups">
      {docs.length === 0 && <p className="fb-recent-chats__empty">No recent chats</p>}
      {buckets.map((bucket) => (
        <section className="fb-recent-chats__group" key={bucket.label}>
          <h3 className="fb-recent-chats__group-label">{bucket.label}</h3>
          <div className="fb-recent-chats__items">
            {bucket.docs.map((recent) => {
              const path = chatPath(recent.id);

              return (
                <ChatHistoryActions
                  adapter={adapter}
                  chat={recent}
                  key={recent.id}
                  onDeleted={() => {
                    if (pathname === path || pathname.startsWith(`${path}/`)) {
                      navigate(viewAllPath);
                    }
                  }}
                >
                  <div className="fb-recent-chats__item">
                    <NavItem
                      active={pathname === path || pathname.startsWith(`${path}/`)}
                      label={recent.title || 'Untitled'}
                      path={path}
                    />
                  </div>
                </ChatHistoryActions>
              );
            })}
          </div>
        </section>
      ))}
      <Link className="fb-recent-chats__view-all" href={viewAllPath}>
        View all
      </Link>
    </div>
  );
}
