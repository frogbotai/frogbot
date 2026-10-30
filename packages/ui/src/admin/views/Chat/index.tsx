import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import { getCachedFrogBot, messagesToUIMessages } from 'frogbot';
import type { DocumentViewServerProps, PayloadComponent } from 'payload';
import { formatAdminURL, getFromImportMap } from 'payload/shared';
import type { ComponentType } from 'react';

import type { ChatDocument } from '../../../chat/adapter.js';
import type { ChatProps, MessageActionsSlotProps } from '../../../chat/chat.js';
import type { GreetingProps } from '../../../chat/greeting.js';
import type { ToolRenderer, ToolRendererProps } from '../../../chat/tool-registry.js';
import { ChatViewClient, type ChatViewSelection } from './ChatView.client.js';

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

  const graphicsIcon = adminComponents?.graphics?.Icon;
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
    ...(graphicsIcon
      ? { icon: RenderServerComponent({ Component: graphicsIcon, importMap: payload.importMap }) }
      : {}),
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
    !chatsSlug ||
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
        chatsSlug={chatsSlug}
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
      chatsSlug={chatsSlug}
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
