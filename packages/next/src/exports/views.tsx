import type {
  ChatProps,
  GreetingProps,
  MessageActionsSlotProps,
  ToolRenderer,
  ToolRendererProps,
} from '@frogbotai/ui/chat';
import { SettingIcon, TileIcon } from '@frogbotai/ui/icons';
import {
  generatePageMetadata as payloadGeneratePageMetadata,
  NotFoundPage as PayloadNotFoundPage,
  RootPage as PayloadRootPage,
} from '@payloadcms/next/views';
import { getTranslation } from '@payloadcms/translations';
import { Card } from '@payloadcms/ui';
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { EntityToGroup } from '@payloadcms/ui/shared';
import { EntityType, groupNavItems } from '@payloadcms/ui/shared';
import { getCachedFrogbot, getPayloadConfig, messagesToUIMessages } from 'frogbot';
import { redirect } from 'next/navigation';
import type { AdminViewServerProps, DocumentViewServerProps, PayloadComponent } from 'payload';
import { formatAdminURL } from 'payload/shared';
import { getFromImportMap } from 'payload/shared';
import type { ComponentProps, ComponentType } from 'react';

import frogbotFavicon from '../assets/frogbot-favicon.png';
import frogbotOGImage from '../assets/frogbot-og.jpg';
import { SettingsNav } from '../elements/SettingsNav/index.js';
export { ViewRedirect } from '../elements/ViewRedirect/index.js';
export { CollectionViewShell } from '../views/CollectionViewShell.js';
import type { FrogbotConfigArg } from '../types.js';
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

export async function ChatView({ doc, payload, routeSegments, user }: DocumentViewServerProps) {
  const segments = routeSegments ?? [];
  const isDashboard = segments.length === 0;
  const [, collectionSlug, documentID] = segments;
  const routeID = isDashboard ? 'create' : documentID;
  const frogbot = getCachedFrogbot();
  const chatsSlug = frogbot?.config.chat.enabled ? frogbot.config.chat.chatsSlug : undefined;
  const messagesSlug = frogbot?.config.chat.enabled ? frogbot.config.chat.messagesSlug : undefined;
  const adminComponents = payload.config?.admin?.components;
  const chatComponents = (
    adminComponents as typeof adminComponents & {
      chat?: {
        AssistantMessageActions?: PayloadComponent;
        Chat?: PayloadComponent;
        Greeting?: PayloadComponent;
        toolComponents?: Record<string, Record<string, PayloadComponent>>;
        UserMessageActions?: PayloadComponent;
      };
    }
  )?.chat;
  const resolveChatComponent = <TProps extends object>(
    component: NonNullable<typeof chatComponents>['Chat'],
  ) =>
    component
      ? getFromImportMap<ComponentType<TProps>>({
          importMap: payload.importMap,
          PayloadComponent: component as never,
          schemaPath: '',
        })
      : undefined;
  const ChatComponent = resolveChatComponent<ChatProps>(chatComponents?.Chat);
  const GreetingComponent = resolveChatComponent<GreetingProps>(chatComponents?.Greeting);
  const UserMessageActions = resolveChatComponent<MessageActionsSlotProps>(
    chatComponents?.UserMessageActions,
  );
  const AssistantMessageActions = resolveChatComponent<MessageActionsSlotProps>(
    chatComponents?.AssistantMessageActions,
  );
  const toolRenderersByAgent = Object.fromEntries(
    Object.entries(chatComponents?.toolComponents ?? {}).map(([agent, components]) => [
      agent,
      Object.entries(components).map(([kind, component]) => ({
        kind,
        render: resolveChatComponent<ToolRendererProps>(component),
      })) as ToolRenderer[],
    ]),
  );
  const clientProps = (component: NonNullable<typeof chatComponents>['Chat']) =>
    component && typeof component === 'object' ? component.clientProps : undefined;
  const graphicsLogo = adminComponents?.graphics?.Logo;
  const chatUser = user as { firstName?: unknown; name?: unknown } | undefined;
  const chatComponentProps = clientProps(chatComponents?.Chat);
  const greetingProps = clientProps(chatComponents?.Greeting);
  const userMessageActionsProps = clientProps(chatComponents?.UserMessageActions);
  const assistantMessageActionsProps = clientProps(chatComponents?.AssistantMessageActions);
  const componentProps = {
    ...(ChatComponent ? { ChatComponent } : {}),
    ...(GreetingComponent ? { GreetingComponent } : {}),
    ...(UserMessageActions ? { UserMessageActions } : {}),
    ...(AssistantMessageActions ? { AssistantMessageActions } : {}),
    ...(Object.keys(toolRenderersByAgent).length > 0 ? { toolRenderersByAgent } : {}),
    ...(chatComponentProps ? { chatComponentProps } : {}),
    ...(greetingProps ? { greetingProps } : {}),
    ...(graphicsLogo
      ? { logo: RenderServerComponent({ Component: graphicsLogo, importMap: payload.importMap }) }
      : {}),
    ...(userMessageActionsProps ? { userMessageActionsProps } : {}),
    ...(typeof chatUser?.name === 'string'
      ? { userName: chatUser.name }
      : typeof chatUser?.firstName === 'string'
        ? { userName: chatUser.firstName }
        : {}),
    ...(assistantMessageActionsProps ? { assistantMessageActionsProps } : {}),
  };

  if (
    !user ||
    (!isDashboard && collectionSlug !== chatsSlug) ||
    routeID === undefined ||
    !messagesSlug
  ) {
    return null;
  }

  const documentPath = formatAdminURL({
    adminRoute: payload.config.routes.admin,
    path: `/collections/${chatsSlug}`,
  });
  if (routeID === 'create') {
    const agent = frogbot?.config.agents?.[0]?.slug;
    return agent ? (
      <ChatViewClient
        agent={agent}
        documentPath={documentPath}
        initialMessages={[]}
        {...componentProps}
      />
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
      {...componentProps}
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
  const adminRoute = payload.config.routes.admin;

  if (routePath === '') {
    redirect(formatAdminURL({ adminRoute, path: '/settings/collections' }));
  }

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
  const accessibleSettings = (
    await Promise.all(
      (settings ?? []).map(async (entry) => ({
        allowed: entry.access ? await entry.access({ req }) : Boolean(req.user),
        entry,
      })),
    )
  ).filter(({ allowed }) => allowed);
  const matched = accessibleSettings
    .map(({ entry }) => entry)
    .sort((a, b) => b.path.length - a.path.length)
    .find((entry) => routePath === entry.path || routePath.startsWith(`${entry.path}/`));
  const entries = [
    { icon: <TileIcon size={18} />, label: 'Collections', path: 'collections' },
    ...accessibleSettings.map(({ entry }) => ({
      icon: entry.icon ? (
        RenderServerComponent({
          Component: entry.icon,
          importMap,
          serverProps: props,
        })
      ) : (
        <SettingIcon size={18} />
      ),
      label: entry.label,
      path: entry.path,
    })),
  ];
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
  const content =
    routePath === 'collections' ? (
      <div className="frogbot-settings__collections">
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
    ) : matched ? (
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
      <SettingsNav
        accountPath={formatAdminURL({
          adminRoute,
          path: payload.config.admin.routes.account,
        })}
        activePath={routePath}
        adminRoute={adminRoute}
        entries={entries}
      />
      <main className="frogbot-settings-template__main">
        <div className="frogbot-settings-template__header">
          {routePath === 'collections' ? 'Collections' : (matched?.label ?? 'Settings')}
        </div>
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
