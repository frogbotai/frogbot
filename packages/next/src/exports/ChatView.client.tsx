'use client';

import type { ChatProps, GreetingProps, MessageActionsSlotProps } from '@frogbotai/ui/chat';
import {
  AgentSelector,
  Chat,
  ChatProvider,
  cookieFetch,
  ModelSelector,
  updateChatAgent,
  useChatProvider,
} from '@frogbotai/ui/chat';
import { ThemeProvider } from '@frogbotai/ui/theme';
import { usePreferences, useTheme } from '@payloadcms/ui';
import type { UIMessage } from 'frogbot';
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from 'react';

const adapter = { fetch: cookieFetch() };
const chatPicksPreference = 'frogbot-chat-picks';

type ChatPicks = {
  agent: string;
  model: string;
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
  initialMessages: UIMessage[];
  logo?: ReactNode;
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
  initialMessages,
  logo,
  userName,
}: ChatViewClientProps) {
  const { theme } = useTheme();
  const replaced = useRef(false);
  const onChatIdChange = (nextChatId: string | number | undefined) => {
    if (chatId !== undefined || nextChatId === undefined || replaced.current) return;
    replaced.current = true;
    window.history.replaceState(
      window.history.state,
      '',
      `${documentPath}/${encodeURIComponent(String(nextChatId))}`,
    );
  };

  return (
    <div className="frogbot-chat-view">
      <ThemeProvider mode={theme}>
        <ChatProvider adapter={adapter}>
          <ChatViewInner
            agent={agent}
            {...(chatId === undefined ? {} : { chatId })}
            initialMessages={initialMessages}
            onChatIdChange={onChatIdChange}
            ChatComponent={ChatComponent}
            GreetingComponent={GreetingComponent}
            greetingProps={greetingProps}
            logo={logo}
            userName={userName}
            UserMessageActions={UserMessageActions}
            AssistantMessageActions={AssistantMessageActions}
            assistantMessageActionsProps={assistantMessageActionsProps}
            chatComponentProps={chatComponentProps}
            userMessageActionsProps={userMessageActionsProps}
          />
        </ChatProvider>
      </ThemeProvider>
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
  agent,
  chatId,
  initialMessages,
  logo,
  onChatIdChange,
  userName,
}: Omit<ChatViewClientProps, 'documentPath'> & {
  onChatIdChange: (chatId: string | number | undefined) => void;
}) {
  const provider = useChatProvider();
  const { getPreference, setPreference } = usePreferences();
  const manifest = provider?.agentManifest;
  const [selectedAgent, setSelectedAgent] = useState(agent);
  const entry = manifest?.agents.find(({ slug }) => slug === selectedAgent);
  const [selectedModel, setSelectedModel] = useState<string>();
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  useEffect(() => {
    if (!manifest || entry || chatId !== undefined) return;
    setSelectedAgent(manifest.defaultAgent);
  }, [chatId, entry, manifest]);

  useEffect(() => {
    if (!manifest) return;
    let current = true;
    void getPreference<ChatPicks | null>(chatPicksPreference).then((preference) => {
      if (!current) return;
      const preferredAgent = manifest.agents.find(({ slug }) => slug === preference?.agent);
      const nextAgent =
        chatId === undefined ? (preferredAgent?.slug ?? manifest.defaultAgent) : agent;
      const nextEntry = manifest.agents.find(({ slug }) => slug === nextAgent);
      setSelectedAgent(nextAgent);
      setSelectedModel(
        preference?.model && nextEntry?.models.some((model) => model === preference.model)
          ? preference.model
          : undefined,
      );
      setPreferencesLoaded(true);
    });
    return () => {
      current = false;
    };
  }, [agent, chatId, getPreference, manifest]);

  const activeModel =
    entry && selectedModel && entry.models.some((model) => model === selectedModel)
      ? selectedModel
      : entry?.defaultModel;

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
    void setPreference<ChatPicks>(chatPicksPreference, {
      agent: nextAgent,
      model: nextEntry.defaultModel,
    });
  };

  const controls = (
    <>
      {(manifest?.agents.length ?? 0) > 1 ? (
        <AgentSelector
          selectedAgent={selectedAgent}
          onAgentChange={(nextAgent) => {
            void changeAgent(nextAgent);
          }}
        />
      ) : null}
      {(entry?.models.length ?? 0) > 1 ? (
        <ModelSelector
          models={entry?.models.map((id) => {
            const separator = id.indexOf('/');
            return {
              id,
              name: separator === -1 ? id : id.slice(separator + 1),
              provider: separator === -1 ? undefined : id.slice(0, separator),
            };
          })}
          selectedModelId={activeModel}
          onModelChange={(model) => {
            const nextModel = model ?? entry?.defaultModel;
            setSelectedModel(nextModel);
            if (nextModel) {
              void setPreference<ChatPicks>(chatPicksPreference, {
                agent: selectedAgent,
                model: nextModel,
              });
            }
          }}
        />
      ) : null}
    </>
  );

  if (!entry || !preferencesLoaded) return null;
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
      {...(chatId === undefined ? {} : { chatId })}
      {...(ChatGreeting ? { greeting: ChatGreeting } : {})}
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
