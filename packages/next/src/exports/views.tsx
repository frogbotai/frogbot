import {
  generatePageMetadata as payloadGeneratePageMetadata,
  NotFoundPage as PayloadNotFoundPage,
  RootPage as PayloadRootPage,
} from '@payloadcms/next/views';
import { getTranslation } from '@payloadcms/translations';
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import { ProfileIcon, SettingIcon, TileIcon } from '@frogbotai/ui/icons';
import { Card, Link } from '@payloadcms/ui';
import type { EntityToGroup } from '@payloadcms/ui/shared';
import { EntityType, groupNavItems } from '@payloadcms/ui/shared';
import { getCachedFrogbot, getPayloadConfig, messagesToUIMessages } from 'frogbot';
import type { ComponentProps } from 'react';
import type { AdminViewServerProps, DocumentViewServerProps, ListViewServerProps } from 'payload';
import { formatAdminURL } from 'payload/shared';
import { redirect } from 'next/navigation';

import frogbotFavicon from '../assets/frogbot-favicon.png';
import frogbotOGImage from '../assets/frogbot-og.jpg';
import { FrogbotNav } from '../elements/Nav/index.js';
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
  const chats = result.docs.map((doc): ChatListItem => ({
    id: doc.id,
    agent: typeof doc.agent === 'string' ? doc.agent : '',
    lastMessageAt: typeof doc.lastMessageAt === 'string' ? doc.lastMessageAt : null,
    title: typeof doc.title === 'string' ? doc.title : null,
  }));

  return <ChatList chats={chats} collectionSlug={collectionConfig.slug} />;
}

export async function ChatView({ doc, payload, routeSegments, user }: DocumentViewServerProps) {
  const segments = routeSegments ?? [];
  const isDashboard = segments.length === 0;
  const [, collectionSlug, documentID] = segments;
  const routeID = isDashboard ? 'create' : documentID;
  const frogbot = getCachedFrogbot();
  const chatsSlug = frogbot?.config.chat.enabled ? frogbot.config.chat.chatsSlug : undefined;
  const messagesSlug = frogbot?.config.chat.enabled ? frogbot.config.chat.messagesSlug : undefined;

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

type SettingsViewProps = AdminViewServerProps & { routeSegments?: string[] };

export function CollectionSettingsRedirect({
  collectionSlug,
  payload,
}: AdminViewServerProps & { collectionSlug: string }) {
  redirect(
    formatAdminURL({
      adminRoute: payload.config.routes.admin,
      path: `/collections/${collectionSlug}`,
    }),
  );
}

export async function SettingsView(props: SettingsViewProps) {
  const { importMap, initPageResult, params, payload } = props;
  const req = initPageResult.req;
  const routeSegments = props.routeSegments ?? (params?.segments as string[] | undefined) ?? [];
  const settingsSegments = routeSegments[0] === 'settings' ? routeSegments.slice(1) : routeSegments;
  const routePath = settingsSegments.join('/');
  const settings = (
    payload.config.admin as typeof payload.config.admin & {
      settings?: Array<{
        access?: (args: { req: typeof req }) => boolean | Promise<boolean>;
        Component: Parameters<typeof RenderServerComponent>[0]['Component'];
        icon?: Parameters<typeof RenderServerComponent>[0]['Component'];
        label: string;
        path: string;
      }>;
    }
  ).settings;
  const matched = [...(settings ?? [])]
    .sort((a, b) => b.path.length - a.path.length)
    .find((entry) => routePath === entry.path || routePath.startsWith(`${entry.path}/`));
  const allowed = matched
    ? matched.access
      ? await matched.access({ req })
      : Boolean(req.user)
    : false;
  const accessibleSettings =
    routePath === ''
      ? (
          await Promise.all(
            (settings ?? []).map(async (entry) => ({
              allowed: entry.access ? await entry.access({ req }) : Boolean(req.user),
              entry,
            })),
          )
        ).filter(({ allowed: entryAllowed }) => entryAllowed)
      : [];
  const collectionGroups =
    routePath === 'collections'
      ? groupNavItems(
          payload.config.collections
            .filter(({ slug }) => initPageResult.visibleEntities.collections.includes(slug))
            .map((entity) => ({ entity, type: EntityType.collection }) satisfies EntityToGroup),
          initPageResult.permissions,
          req.i18n,
        )
      : [];
  const adminRoute = routePath === '' ? payload.config.routes.admin : '';
  const content =
    routePath === '' ? (
      <div className="frogbot-settings__landing">
        <h1>Settings</h1>
        <p>Manage your FrogBot workspace.</p>
        <ul className="frogbot-settings__card-list">
          <li>
            <Link
              className="frogbot-settings-card"
              href={formatAdminURL({
                adminRoute,
                path: payload.config.admin.routes.account,
              })}
            >
              <span aria-hidden="true" className="frogbot-settings-card__icon">
                <ProfileIcon size={24} />
              </span>
              <span className="frogbot-settings-card__label">Account</span>
            </Link>
          </li>
          <li>
            <Link
              className="frogbot-settings-card"
              href={formatAdminURL({ adminRoute, path: '/settings/collections' })}
            >
              <span aria-hidden="true" className="frogbot-settings-card__icon">
                <TileIcon size={24} />
              </span>
              <span className="frogbot-settings-card__label">Collections</span>
            </Link>
          </li>
          {accessibleSettings.map(({ entry }) => (
            <li key={entry.path}>
              <Link
                className="frogbot-settings-card"
                href={formatAdminURL({ adminRoute, path: `/settings/${entry.path}` })}
              >
                <span aria-hidden="true" className="frogbot-settings-card__icon">
                  {entry.icon ? (
                    RenderServerComponent({
                      Component: entry.icon,
                      importMap,
                      serverProps: props,
                    })
                  ) : (
                    <SettingIcon size={24} />
                  )}
                </span>
                <span className="frogbot-settings-card__label">{entry.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    ) : routePath === 'collections' ? (
      <div className="frogbot-settings__collections">
        <h1>Collections</h1>
        {collectionGroups.map((group) => (
          <section className="frogbot-settings__collection-group" key={group.label}>
            <h2>{group.label}</h2>
            <ul className="frogbot-settings__collection-list">
              {group.entities.map(({ label, slug }) => {
                const title = getTranslation(label, req.i18n);
                return (
                  <li key={slug}>
                    <Card
                      buttonAriaLabel={req.i18n.t('general:showAllLabel', { label: title })}
                      href={formatAdminURL({
                        adminRoute: payload.config.routes.admin,
                        path: `/collections/${slug}`,
                      })}
                      id={`card-${slug}`}
                      title={title}
                      titleAs="h3"
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    ) : matched && allowed ? (
      RenderServerComponent({
        Component: matched.Component,
        importMap,
        serverProps: props,
      })
    ) : (
      <div className="frogbot-settings__not-found">
        <h1>Page not found</h1>
        <p>Sorry, there is nothing to correspond with your request.</p>
      </div>
    );

  return (
    <div className="frogbot-settings-template">
      <FrogbotNav
        {...props}
        req={req}
        user={req.user ?? undefined}
        visibleEntities={initPageResult.visibleEntities}
      />
      <main className="frogbot-settings-template__main">
        <div className="frogbot-settings-template__header">FrogBot Settings</div>
        <div className="frogbot-settings-template__content">{content}</div>
      </main>
    </div>
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
