'use client';

import type {
  ChatDocument,
  ChatProps,
  GreetingProps,
  MessageActionsSlotProps,
  ToolRenderer,
  UseChatDocumentOptions,
} from '@frogbotai/ui/chat';
import {
  AgentSelector,
  Chat,
  ChatProvider,
  cookieFetch,
  ModelSelector,
  updateChatAgent,
  useChatDocument,
  useChatProvider,
} from '@frogbotai/ui/chat';
import { getTranslation } from '@payloadcms/translations';
import {
  toast,
  useConfig,
  usePreferences,
  useRouteTransition,
  useStepNav,
  useTranslation,
} from '@payloadcms/ui';
import type { UIMessage } from 'frogbot';
import { usePathname, useRouter } from 'next/navigation.js';
import { type ComponentType, type ReactNode, useEffect, useState } from 'react';

const adapter = { fetch: cookieFetch() };
const chatPicksPreference = 'frogbot-chat-picks';

type ChatPicks = {
  agent: string;
  model: string;
  reasoning?: Record<string, string>;
};

export type ChatViewSelection = {
  model: string;
  reasoning?: string;
};

export type ChatViewClientProps = {
  AssistantMessageActions?: ComponentType<MessageActionsSlotProps>;
  assistantMessageActionsProps?: object;
  ChatComponent?: ComponentType<ChatProps>;
  chatComponentProps?: object;
  GreetingComponent?: ComponentType<GreetingProps>;
  greetingProps?: object;
  UserMessageActions?: ComponentType<MessageActionsSlotProps>;
  userMessageActionsProps?: object;
  agent: string;
  chatId?: string | number;
  documentPath: string;
  initialChat?: ChatDocument;
  initialMessages: UIMessage[];
  initialSelection?: ChatViewSelection;
  logo?: ReactNode;
  toolRenderersByAgent?: Record<string, readonly ToolRenderer[]>;
  userName?: string;
};

export function ChatViewClient({
  AssistantMessageActions,
  assistantMessageActionsProps,
  ChatComponent,
  chatComponentProps,
  GreetingComponent,
  greetingProps,
  UserMessageActions,
  userMessageActionsProps,
  agent,
  chatId,
  documentPath,
  initialChat,
  initialMessages,
  initialSelection,
  logo,
  toolRenderersByAgent = {},
  userName,
}: ChatViewClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { startRouteTransition } = useRouteTransition();
  const [selectedAgent, setSelectedAgent] = useState(agent);
  const [labelChatId, setLabelChatId] = useState(chatId);
  const [routeChatId, setRouteChatId] = useState(chatId);
  const [threadPath, setThreadPath] = useState<string>();
  const [viewedPathname, setViewedPathname] = useState(pathname);
  const [session, setSession] = useState(0);

  if (routeChatId !== chatId) {
    setRouteChatId(chatId);
    setLabelChatId(chatId);
  }

  if (viewedPathname !== pathname) {
    setViewedPathname(pathname);

    if (viewedPathname === threadPath) {
      setThreadPath(undefined);
      setLabelChatId(undefined);
      setSession(session + 1);
    }
  }

  const chatPath = (id: string | number) => `${documentPath}/${encodeURIComponent(String(id))}`;
  const routedPath = chatId === undefined ? threadPath : chatPath(chatId);

  const staleThread =
    chatId === undefined &&
    pathname !== threadPath &&
    pathname !== `${documentPath}/create` &&
    pathname.startsWith(`${documentPath}/`);

  useEffect(() => {
    if (staleThread) startRouteTransition(() => router.refresh());
  }, [router, staleThread, startRouteTransition]);

  const onChatIdChange = (nextChatId: string | number | undefined) => {
    setLabelChatId(nextChatId);

    if (nextChatId === undefined) return;

    const path = chatPath(nextChatId);

    if (path === routedPath) return;

    if (routedPath === undefined) {
      setThreadPath(path);
      window.history.replaceState(null, '', path);

      return;
    }

    startRouteTransition(() => router.push(path));
  };

  return (
    <div className="frogbot-chat-view">
      <ChatProvider adapter={adapter} toolRenderers={toolRenderersByAgent[selectedAgent]}>
        <ChatStepNav chatId={labelChatId} documentPath={documentPath} initialChat={initialChat} />
        <ChatViewInner
          key={session}
          agent={agent}
          {...(chatId === undefined ? {} : { chatId })}
          {...(initialChat === undefined ? {} : { initialChat })}
          initialMessages={initialMessages}
          initialSelection={initialSelection}
          onChatIdChange={onChatIdChange}
          ChatComponent={ChatComponent}
          GreetingComponent={GreetingComponent}
          greetingProps={greetingProps}
          logo={logo}
          selectedAgent={selectedAgent}
          setSelectedAgent={setSelectedAgent}
          userName={userName}
          UserMessageActions={UserMessageActions}
          AssistantMessageActions={AssistantMessageActions}
          assistantMessageActionsProps={assistantMessageActionsProps}
          chatComponentProps={chatComponentProps}
          userMessageActionsProps={userMessageActionsProps}
        />
      </ChatProvider>
    </div>
  );
}

type ChatStepNavProps = {
  chatId: string | number | undefined;
  documentPath: string;
  initialChat: ChatDocument | undefined;
};

function ChatStepNav({ chatId, documentPath, initialChat }: ChatStepNavProps) {
  const provider = useChatProvider();
  const { setStepNav } = useStepNav();
  const sdk = provider?.sdk;
  const chatsSlug = provider?.manifest?.chat.enabled ? provider.manifest.chat.chatsSlug : undefined;
  const threadOpen = sdk !== undefined && chatsSlug !== undefined && chatId !== undefined;

  useEffect(() => {
    if (!threadOpen) setStepNav([]);
  }, [setStepNav, threadOpen]);

  if (!threadOpen) return null;

  return (
    <ChatStepNavInner
      chatId={chatId}
      chatsSlug={chatsSlug}
      documentPath={documentPath}
      initialChat={initialChat}
      sdk={sdk}
    />
  );
}

function ChatStepNavInner({
  chatId,
  chatsSlug,
  documentPath,
  initialChat,
  sdk,
}: ChatStepNavProps & {
  chatId: string | number;
  chatsSlug: string;
  sdk: UseChatDocumentOptions['sdk'];
}) {
  const pathname = usePathname();
  const { i18n } = useTranslation();
  const { getEntityConfig } = useConfig();
  const { setStepNav } = useStepNav();
  const chatsLabel = getTranslation(
    getEntityConfig({ collectionSlug: chatsSlug }).labels.plural,
    i18n,
  );

  const { chat } = useChatDocument({
    sdk,
    chatsSlug,
    chatId,
    initialData: initialChat,
    revalidate: true,
  });

  const loaded = chat !== undefined;
  const title = chat?.title || 'Untitled';

  useEffect(() => {
    const chats = { label: chatsLabel, url: documentPath };

    setStepNav(loaded ? [chats, { label: title }] : [chats]);
  }, [chatsLabel, documentPath, loaded, pathname, setStepNav, title]);

  return null;
}

function ChatViewInner({
  AssistantMessageActions,
  assistantMessageActionsProps,
  ChatComponent = Chat,
  chatComponentProps,
  GreetingComponent,
  greetingProps,
  UserMessageActions,
  userMessageActionsProps,
  chatId,
  agent: initialAgent,
  initialChat,
  initialMessages,
  initialSelection,
  logo,
  onChatIdChange,
  selectedAgent,
  setSelectedAgent,
  userName,
}: Omit<ChatViewClientProps, 'documentPath' | 'toolRenderersByAgent'> & {
  onChatIdChange: (chatId: string | number | undefined) => void;
  selectedAgent: string;
  setSelectedAgent: (agent: string) => void;
}) {
  const provider = useChatProvider();
  const { getPreference, setPreference } = usePreferences();
  const manifest = provider?.agentManifest;
  const entry = manifest?.agents.find(({ slug }) => slug === selectedAgent);
  const [selectedModel, setSelectedModel] = useState<string>();
  const [reasoningByModel, setReasoningByModel] = useState<Record<string, string>>({});
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  useEffect(() => {
    if (!manifest || entry || chatId !== undefined) return;
    setSelectedAgent(manifest.defaultAgent);
  }, [chatId, entry, manifest]);

  useEffect(() => {
    if (!manifest) return;

    let current = true;

    void getPreference<unknown>(chatPicksPreference).then((value) => {
      if (!current) return;

      const preference = readChatPicks(value);
      const preferredAgent = manifest.agents.find(({ slug }) => slug === preference.agent);
      const nextAgent =
        chatId === undefined ? (preferredAgent?.slug ?? manifest.defaultAgent) : initialAgent;
      const nextEntry = manifest.agents.find(({ slug }) => slug === nextAgent);
      const offers = (model: string | undefined) =>
        nextEntry?.models.some((option) => option === model) ?? false;

      const chatSelection =
        chatId !== undefined && offers(initialSelection?.model) ? initialSelection : undefined;

      setSelectedAgent(nextAgent);
      setSelectedModel(
        chatSelection?.model ?? (offers(preference.model) ? preference.model : undefined),
      );
      setReasoningByModel(
        chatSelection
          ? rememberReasoning(preference.reasoning, chatSelection.model, chatSelection.reasoning)
          : preference.reasoning,
      );
      setPreferencesLoaded(true);
    });

    return () => {
      current = false;
    };
  }, [chatId, getPreference, initialAgent, initialSelection, manifest, setSelectedAgent]);

  const activeModel = entry?.models.find((model) => model === selectedModel) ?? entry?.defaultModel;
  const reasoningOptions = activeModel ? entry?.reasoning?.[activeModel] : undefined;
  const rememberedReasoning = activeModel ? reasoningByModel[activeModel] : undefined;

  const activeReasoning = reasoningOptions?.some(({ key }) => key === rememberedReasoning)
    ? rememberedReasoning
    : undefined;

  const savePicks = (picks: ChatPicks) => {
    void setPreference<ChatPicks>(chatPicksPreference, picks);
  };

  const changeAgent = async (nextAgent: string) => {
    const nextEntry = manifest?.agents.find(({ slug }) => slug === nextAgent);
    if (!nextEntry) return;
    if (chatId !== undefined) {
      const chatsSlug = provider?.manifest?.chat.enabled
        ? provider.manifest.chat.chatsSlug
        : undefined;
      if (!provider || !chatsSlug) return;
      try {
        await updateChatAgent({ sdk: provider.sdk, chatsSlug, chatId }, nextAgent);
      } catch {
        return;
      }
    }

    setSelectedAgent(nextAgent);
    setSelectedModel(undefined);
    savePicks({ agent: nextAgent, model: nextEntry.defaultModel, reasoning: reasoningByModel });
  };

  if (!entry || !activeModel || !preferencesLoaded) return null;

  const changeModel = (id: string) => {
    const nextModel = entry.models.find((model) => model === id);

    if (!nextModel) return;

    setSelectedModel(nextModel);
    savePicks({ agent: selectedAgent, model: nextModel, reasoning: reasoningByModel });
  };

  const changeReasoning = (key: string | undefined) => {
    const nextReasoning = rememberReasoning(reasoningByModel, activeModel, key);

    setReasoningByModel(nextReasoning);
    savePicks({ agent: selectedAgent, model: activeModel, reasoning: nextReasoning });
  };

  const controls = (
    <>
      {manifest && manifest.agents.length > 1 ? (
        <AgentSelector
          selectedAgent={selectedAgent}
          onAgentChange={(nextAgent) => {
            void changeAgent(nextAgent);
          }}
        />
      ) : null}
      {entry.models.length > 1 || reasoningOptions?.length ? (
        <ModelSelector
          models={entry.models.map((id) => {
            const separator = id.indexOf('/');

            return {
              id,
              name: separator === -1 ? id : id.slice(separator + 1),
              provider: separator === -1 ? undefined : id.slice(0, separator),
              reasoning: entry.reasoning?.[id],
            };
          })}
          selectedModelId={activeModel}
          selectedReasoning={activeReasoning}
          onModelChange={changeModel}
          onReasoningChange={changeReasoning}
        />
      ) : null}
    </>
  );

  const UserActions = UserMessageActions
    ? (props: MessageActionsSlotProps) => (
        <UserMessageActions {...userMessageActionsProps} {...props} />
      )
    : undefined;
  const AssistantActions = AssistantMessageActions
    ? (props: MessageActionsSlotProps) => (
        <AssistantMessageActions {...assistantMessageActionsProps} {...props} />
      )
    : undefined;
  const ChatGreeting = GreetingComponent
    ? (props: GreetingProps) => <GreetingComponent {...greetingProps} {...props} />
    : undefined;
  return (
    <ChatComponent
      {...chatComponentProps}
      agent={selectedAgent}
      model={activeModel}
      reasoning={activeReasoning}
      {...(chatId === undefined ? {} : { chatId })}
      {...(ChatGreeting ? { greeting: ChatGreeting } : {})}
      {...(initialChat === undefined ? {} : { initialChat })}
      initialMessages={initialMessages}
      logo={logo}
      errorContent={false}
      onError={(error) => toast.error(error.message)}
      onChatIdChange={onChatIdChange}
      composerStartSlot={controls}
      userMessageActions={UserActions}
      userName={userName}
      assistantMessageActions={AssistantActions}
    />
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readChatPicks(value: unknown) {
  const picks = isRecord(value) ? value : {};

  const reasoning = isRecord(picks.reasoning)
    ? Object.entries(picks.reasoning).filter(
        (level): level is [string, string] => typeof level[1] === 'string',
      )
    : [];

  return {
    agent: typeof picks.agent === 'string' ? picks.agent : undefined,
    model: typeof picks.model === 'string' ? picks.model : undefined,
    reasoning: Object.fromEntries(reasoning),
  };
}

function rememberReasoning(
  levels: Record<string, string>,
  model: string,
  key: string | undefined,
): Record<string, string> {
  const { [model]: _previous, ...rest } = levels;

  return key === undefined ? rest : { ...rest, [model]: key };
}
