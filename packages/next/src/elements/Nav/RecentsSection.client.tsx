'use client';

import {
  type ChatDocument,
  ChatHistoryActions,
  createCookieSDK,
  useChats,
} from '@frogbotai/ui/chat';
import { Link, useConfig } from '@payloadcms/ui';
import { usePathname, useRouter } from 'next/navigation.js';
import { useMemo } from 'react';

import { NavItem } from './NavItem.js';

export type RecentsSectionClientProps = {
  chatsSlug: string;
  collectionPath: string;
  messagesSlug: string;
  recents: ChatDocument[];
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

export function RecentsSectionClient({
  chatsSlug,
  collectionPath,
  messagesSlug,
  recents,
}: RecentsSectionClientProps) {
  const { config } = useConfig();
  const pathname = usePathname();
  const router = useRouter();
  const sdk = useMemo(() => createCookieSDK(config.routes.api), [config.routes.api]);
  const chats = useChats({
    sdk,
    chatsSlug,
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
    <div className="frogbot-recents-section__groups">
      {docs.length === 0 && <p className="frogbot-recents-section__empty">No recent chats</p>}
      {buckets.map((bucket) => (
        <section className="frogbot-recents-section__group" key={bucket.label}>
          <h3 className="frogbot-recents-section__group-label">{bucket.label}</h3>
          <div className="frogbot-recents-section__items">
            {bucket.docs.map((recent) => {
              const path = `${collectionPath}/${encodeURIComponent(String(recent.id))}`;
              return (
                <ChatHistoryActions
                  chat={recent}
                  chatsSlug={chatsSlug}
                  key={recent.id}
                  messagesSlug={messagesSlug}
                  onDeleted={() => {
                    if (pathname === path || pathname.startsWith(`${path}/`)) {
                      router.push(collectionPath);
                    }
                  }}
                  sdk={sdk}
                >
                  <div className="frogbot-recents-section__item">
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
      <Link className="frogbot-recents-section__view-all" href={collectionPath}>
        View all
      </Link>
    </div>
  );
}
