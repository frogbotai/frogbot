import { NavSection } from '@frogbotai/next';
import { RecentsSectionClient } from '@frogbotai/next/client';
import type { ChatDocument } from '@frogbotai/ui/chat';
import { getCachedFrogbot } from 'frogbot';
import type { PayloadRequest, ServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';

export type RecentsSectionProps = { req?: PayloadRequest } & ServerProps;

export async function RecentsSection({ payload, req }: RecentsSectionProps) {
  const chat = getCachedFrogbot()?.config.chat;
  const chatsSlug = chat?.enabled ? chat.chatsSlug : '';
  let recents: ChatDocument[] = [];
  let collectionPath = '';

  if (chat?.enabled && req?.user) {
    const result = await payload.find({
      collection: chat.chatsSlug,
      depth: 0,
      limit: 30,
      overrideAccess: false,
      req,
      sort: '-lastMessageAt',
    });
    collectionPath = formatAdminURL({
      adminRoute: payload.config.routes.admin,
      path: `/collections/${chat.chatsSlug}`,
    });
    recents = result.docs.map((doc) => ({
      id: doc.id,
      title: typeof doc.title === 'string' && doc.title ? doc.title : 'Untitled Chat',
      agent: typeof doc.agent === 'string' ? doc.agent : '',
      lastMessageAt: typeof doc.lastMessageAt === 'string' ? doc.lastMessageAt : null,
    }));
  }

  return (
    <NavSection id="recents" title="Recents">
      <RecentsSectionClient
        chatsSlug={chatsSlug}
        collectionPath={collectionPath}
        recents={recents}
      />
    </NavSection>
  );
}
