'use client';

import type {
  ChatDocument,
  ChatProps,
  GreetingProps,
  MessageActionsSlotProps,
  ToolRenderer,
} from '@frogbotai/ui/chat';
import {
  AgentSelector,
  Chat,
  ChatProvider,
  cookieFetch,
  ModelSelector,
  updateChatAgent,
  useChatProvider,
} from '@frogbotai/ui/chat';
import { usePreferences, useRouteTransition } from '@payloadcms/ui';
import type { UIMessage } from 'frogbot';
import { useRouter } from 'next/navigation.js';
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from 'react';

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
  const { startRouteTransition } = useRouteTransition();
  const [selectedAgent, setSelectedAgent] = useState(agent);
  const replaced = useRef(false);

  const onChatIdChange = (nextChatId: string | number | undefined) => {
    if (nextChatId === undefined) return;

    const path = `${documentPath}/${encodeURIComponent(String(nextChatId))}`;

    if (chatId !== undefined) {
      if (String(nextChatId) !== String(chatId)) startRouteTransition(() => router.push(path));

      return;
    }

    if (replaced.current) return;

    replaced.current = true;
    window.history.replaceState(window.history.state, '', path);
  };

  return (
    <div className="frogbot-chat-view">
      <ChatProvider adapter={adapter} toolRenderers={toolRenderersByAgent[selectedAgent]}>
        <ChatViewInner
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
