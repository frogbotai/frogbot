import {
  generatePageMetadata as payloadGeneratePageMetadata,
  NotFoundPage as PayloadNotFoundPage,
  RootPage as PayloadRootPage,
} from '@payloadcms/next/views';
import { getCachedFrogbot, getPayloadConfig, messagesToUIMessages } from 'frogbot';
import type { ComponentProps } from 'react';
import type { DocumentViewServerProps, ListViewServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';

import frogbotFavicon from '../assets/frogbot-favicon.png';
import frogbotOGImage from '../assets/frogbot-og.jpg';
import type { FrogbotConfigArg } from '../types.js';
import { ChatList, type ChatListItem } from './ChatListView.client.js';
import { ChatViewClient } from './ChatView.client.js';

const assetURL = (asset: { src: string } | string): string =>
  typeof asset === 'object' ? asset.src : asset;

type RootPageProps = Omit<ComponentProps<typeof PayloadRootPage>, 'config'> & {
  readonly config: FrogbotConfigArg;
};

export function RootPage({ config, ...rest }: RootPageProps) {
  return <PayloadRootPage {...rest} config={getPayloadConfig(config)} />;
}

type NotFoundPageProps = Omit<ComponentProps<typeof PayloadNotFoundPage>, 'config'> & {
  readonly config: FrogbotConfigArg;
};

export function NotFoundPage({ config, ...rest }: NotFoundPageProps) {
  return <PayloadNotFoundPage {...rest} config={getPayloadConfig(config)} />;
}

export async function ChatListView({
  collectionConfig,
  limit,
  payload,
  user,
}: ListViewServerProps) {
  const result = await payload.find({
    collection: collectionConfig.slug,
    depth: 0,
    limit,
    overrideAccess: false,
    sort: '-lastMessageAt',
    user,
  });
  const chats = result.docs.map(
    (doc): ChatListItem => ({
      id: doc.id,
      agent: typeof doc.agent === 'string' ? doc.agent : '',
      lastMessageAt: typeof doc.lastMessageAt === 'string' ? doc.lastMessageAt : null,
      title: typeof doc.title === 'string' ? doc.title : null,
    }),
  );

  return <ChatList chats={chats} collectionSlug={collectionConfig.slug} />;
}

export async function ChatView({ doc, payload, routeSegments, user }: DocumentViewServerProps) {
  const isDashboard = routeSegments.length === 0;
  const [, collectionSlug, documentID] = routeSegments;
  const routeID = isDashboard ? 'create' : documentID;
  const frogbot = getCachedFrogbot();
  const chatsSlug = frogbot?.config.chat.enabled ? frogbot.config.chat.chatsSlug : undefined;
  const messagesSlug = frogbot?.config.chat.enabled
    ? frogbot.config.chat.messagesSlug
    : undefined;

  if (
    !user ||
    (!isDashboard && collectionSlug !== chatsSlug) ||
    routeID === undefined ||
    !messagesSlug
  )
    return null;

  const documentPath = formatAdminURL({
    adminRoute: payload.config.routes.admin,
    path: `/collections/${chatsSlug}`,
  });
  if (routeID === 'create') {
    const agent = frogbot?.config.agents?.[0]?.slug;
    return agent ? (
      <ChatViewClient agent={agent} documentPath={documentPath} initialMessages={[]} />
    ) : null;
  }

  const result = await payload.find({
    collection: messagesSlug,
    depth: 0,
    limit: 500,
    overrideAccess: false,
    sort: ['createdAt', 'id'],
    user,
    where: { chat: { equals: routeID } },
  });

  return (
    <ChatViewClient
      agent={typeof doc.agent === 'string' ? doc.agent : ''}
      chatId={routeID}
      documentPath={documentPath}
      initialMessages={messagesToUIMessages(result.docs as never)}
    />
  );
}

type GeneratePageMetadataArgs = Omit<
  Parameters<typeof payloadGeneratePageMetadata>[0],
  'config'
> & {
  config: FrogbotConfigArg;
};

export async function generatePageMetadata(
  args: GeneratePageMetadataArgs,
): ReturnType<typeof payloadGeneratePageMetadata> {
  const { config, ...rest } = args;
  const payloadConfig = getPayloadConfig(config);
  const metadata = await payloadGeneratePageMetadata({ ...rest, config: payloadConfig });
  const meta = (await payloadConfig).admin?.meta;

  if (!meta?.icons) {
    metadata.icons = [
      { rel: 'icon', sizes: '32x32', type: 'image/png', url: assetURL(frogbotFavicon) },
    ];
  }

  if (meta?.defaultOGImageType === 'static' && !meta?.openGraph?.images) {
    metadata.openGraph = {
      ...metadata.openGraph,
      images: [{ alt: 'FrogBot', height: 630, url: assetURL(frogbotOGImage), width: 1200 }],
    };
  }

  return metadata;
}
