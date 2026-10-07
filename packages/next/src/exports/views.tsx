import type {
  ChatDocument,
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
import { EntityType } from '@payloadcms/ui/shared';
import { getCachedFrogBot, messagesToUIMessages } from 'frogbot';
import { attachRegisteredFrogBot, getPayloadConfig } from 'frogbot/internal';
import { redirect } from 'next/navigation';
import type { AdminViewServerProps, DocumentViewServerProps, PayloadComponent } from 'payload';
import { formatAdminURL } from 'payload/shared';
import { getFromImportMap } from 'payload/shared';
import type { ComponentProps, ComponentType } from 'react';

import frogbotFavicon from '../assets/frogbot-favicon.png';
import frogbotOGImage from '../assets/frogbot-og.jpg';
import { splitNavGroups } from '../elements/Nav/buildNavModel.js';
import { renderNavIcon } from '../elements/Nav/renderNavIcon.js';
import { SettingsNav } from '../elements/SettingsNav/index.js';
import { getSettingsTitle } from '../views/Settings/metadata.js';
import type { SettingsEntry } from '../views/Settings/resolveSection.js';
import { getSettingsRoutePath, resolveSettingsSection } from '../views/Settings/resolveSection.js';
export { BoardView } from '../views/Board/index.js';
export { CalendarView } from '../views/Calendar/index.js';
export { CollectionViewShell } from '../views/CollectionViewShell.js';
export { CollectionViewSwitcher } from '../views/CollectionViewSwitcher.js';
export { ConnectionsView } from '../views/Connections/index.js';
export { CustomCollectionView } from '../views/CustomCollectionView.js';
export { DefaultListView } from '../views/List/DefaultListView.client.js';
import type { FrogBotConfigArg } from '../types.js';
import { brandImportMapErrors } from '../utilities/brandImportMapErrors.js';
import { ChatViewClient, type ChatViewSelection } from './ChatView.client.js';

brandImportMapErrors();

const assetURL = (asset: { src: string } | string): string =>
  typeof asset === 'object' ? asset.src : asset;

type RootPageProps = Omit<ComponentProps<typeof PayloadRootPage>, 'config'> & {
  readonly config: FrogBotConfigArg;
};

export function RootPage({ config, ...rest }: RootPageProps) {
  return <PayloadRootPage {...rest} config={getPayloadConfig(config)} />;
}

type NotFoundPageProps = Omit<ComponentProps<typeof PayloadNotFoundPage>, 'config'> & {
  readonly config: FrogBotConfigArg;
};

export function NotFoundPage({ config, ...rest }: NotFoundPageProps) {
  return <PayloadNotFoundPage {...rest} config={getPayloadConfig(config)} />;
}

function toInitialChat({
  doc,
  id,
}: {
  doc: DocumentViewServerProps['doc'];
  id: string;
}): ChatDocument {
  const text = (value: unknown) => (typeof value === 'string' ? value : null);

  return {
    id,
    agent: text(doc.agent) ?? '',
    title: text(doc.title),
    channel: text(doc.channel),
    channelLabel: text(doc.channelLabel),
  };
}

export async function ChatView({ doc, payload, routeSegments, user }: DocumentViewServerProps) {
  const segments = routeSegments ?? [];
  const isDashboard = segments.length === 0;
  const [, collectionSlug, documentID] = segments;
  const routeID = isDashboard ? 'create' : documentID;
  const frogbot = getCachedFrogBot();
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
          PayloadComponent: component,
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

  const [result, latest] = await Promise.all([
    payload.find({
      collection: messagesSlug,
      depth: 0,
      limit: 500,
      overrideAccess: false,
      sort: ['createdAt', 'id'],
      user,
      where: { chat: { equals: routeID } },
    }),
    payload.find({
      collection: messagesSlug,
      depth: 0,
      limit: 1,
      overrideAccess: false,
      sort: ['-createdAt', '-id'],
      user,
      where: {
        and: [
          { chat: { equals: routeID } },
          { role: { equals: 'user' } },
          { status: { not_equals: 'queued' } },
        ],
      },
    }),
  ]);

  const governing = latest.docs[0] as { model?: unknown; reasoning?: unknown } | undefined;

  const initialSelection: ChatViewSelection | undefined =
    typeof governing?.model === 'string'
      ? {
          model: governing.model,
          ...(typeof governing.reasoning === 'string' ? { reasoning: governing.reasoning } : {}),
        }
      : undefined;

  const initialChat = toInitialChat({ doc, id: routeID });

  return (
    <ChatViewClient
      agent={initialChat.agent}
      chatId={routeID}
      documentPath={documentPath}
      initialChat={initialChat}
      initialMessages={messagesToUIMessages(
        result.docs.map(({ id, metadata, parts, role }) => ({ id, metadata, parts, role })),
      )}
      initialSelection={initialSelection}
      {...componentProps}
    />
  );
}

type SettingsViewProps = AdminViewServerProps & { routeSegments?: string[] };

export async function SettingsView(props: SettingsViewProps) {
  const { importMap, initPageResult, params, payload } = props;
  const req = initPageResult.req;
  const routePath = getSettingsRoutePath(
    props.routeSegments ?? (params?.segments as string[] | undefined) ?? [],
  );
  const adminRoute = payload.config.routes.admin;

  if (routePath === '') {
    redirect(formatAdminURL({ adminRoute, path: '/settings/collections' }));
  }

  const settings = (
    payload.config.admin as typeof payload.config.admin & { settings?: SettingsEntry[] }
  ).settings;

  const { accessible, matched, title } = await resolveSettingsSection({
    entries: settings,
    req: attachRegisteredFrogBot(req),
    routePath,
  });

  const entries = [
    { icon: <TileIcon size={18} />, label: 'Collections', path: 'collections' },
    ...accessible.map((entry) => ({
      icon: renderNavIcon({ icon: entry.icon, importMap, serverProps: props, size: 18 }) ?? (
        <SettingIcon size={18} />
      ),
      label: entry.label,
      path: entry.path,
    })),
  ];
  const collectionGroups =
    routePath === 'collections'
      ? splitNavGroups({
          entities: payload.config.collections
            .filter(({ slug }) => initPageResult.visibleEntities.collections.includes(slug))
            .map((entity) => ({ entity, type: EntityType.collection }) satisfies EntityToGroup),
          i18n: req.i18n,
          permissions: initPageResult.permissions,
        })
      : { groups: [], ungrouped: [] };

  const renderCollectionList = (entities: typeof collectionGroups.ungrouped) => (
    <ul className="frogbot-settings__collection-list">
      {entities.map(({ label, slug }) => {
        const cardTitle = getTranslation(label, req.i18n);

        return (
          <li key={slug}>
            <Card
              buttonAriaLabel={req.i18n.t('general:showAllLabel', { label: cardTitle })}
              href={formatAdminURL({
                adminRoute: payload.config.routes.admin,
                path: `/collections/${slug}`,
              })}
              id={`card-${slug}`}
              title={cardTitle}
              titleAs="h3"
            />
          </li>
        );
      })}
    </ul>
  );

  const content =
    routePath === 'collections' ? (
      <div className="frogbot-settings__collections">
        {collectionGroups.ungrouped.length > 0 ? (
          <section className="frogbot-settings__collection-group">
            {renderCollectionList(collectionGroups.ungrouped)}
          </section>
        ) : null}
        {collectionGroups.groups.map((group) => (
          <section className="frogbot-settings__collection-group" key={group.label}>
            <h2>{group.label}</h2>
            {renderCollectionList(group.entities)}
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
        <div className="frogbot-settings-template__header">{title}</div>
        <div className="frogbot-settings-template__content">{content}</div>
      </main>
    </div>
  );
}

type GeneratePageMetadataArgs = Omit<
  Parameters<typeof payloadGeneratePageMetadata>[0],
  'config'
> & {
  config: FrogBotConfigArg;
};

export async function generatePageMetadata(
  args: GeneratePageMetadataArgs,
): ReturnType<typeof payloadGeneratePageMetadata> {
  const { config, ...rest } = args;
  const payloadConfig = getPayloadConfig(config);
  const metadata = await payloadGeneratePageMetadata({ ...rest, config: payloadConfig });
  const resolvedConfig = await payloadConfig;
  const meta = resolvedConfig.admin?.meta;

  const params = await args.params;
  const settingsTitle = await getSettingsTitle({
    config: resolvedConfig,
    segments: Array.isArray(params.segments) ? params.segments : [],
  });

  if (settingsTitle !== undefined) {
    const suffix = meta?.titleSuffix;

    metadata.title = suffix ? `${settingsTitle} ${suffix}` : settingsTitle;
    metadata.description = settingsTitle;
    metadata.keywords = settingsTitle;
    metadata.openGraph = { ...metadata.openGraph, title: settingsTitle };
  }

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
