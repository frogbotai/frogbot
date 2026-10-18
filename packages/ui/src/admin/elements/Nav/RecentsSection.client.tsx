'use client';

import { useConfig } from '@payloadcms/ui';
import { useMemo } from 'react';

import { type ChatDocument } from '../../../chat/adapter.js';
import { createRestChatAdapter } from '../../../chat/rest/adapter.js';
import { cookieFetch } from '../../../chat/rest/auth.js';
import { RecentChats } from '../../../nav/RecentChats.js';

export type RecentsSectionClientProps = {
  chatsSlug: string;
  collectionPath: string;
  messagesSlug: string;
  recents: ChatDocument[];
};

export function RecentsSectionClient({
  chatsSlug,
  collectionPath,
  messagesSlug,
  recents,
}: RecentsSectionClientProps) {
  const { config } = useConfig();
  const adapter = useMemo(
    () =>
      createRestChatAdapter({
        apiBase: config.routes.api,
        fetch: cookieFetch(),
        chatsSlug,
        messagesSlug,
      }),
    [chatsSlug, config.routes.api, messagesSlug],
  );

  return (
    <RecentChats
      adapter={adapter}
      chatPath={(id) => `${collectionPath}/${encodeURIComponent(String(id))}`}
      recents={recents}
      viewAllPath={collectionPath}
    />
  );
}
