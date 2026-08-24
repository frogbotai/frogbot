'use client';

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { useControlledState } from '../hooks/use-controlled-state';
import type { ComposerAttachment } from './attachments';
import { ChatShell } from './chat-shell';
import { ChatStatus } from './chat-status';
import { Composer } from './composer';
import { isFlagPart, renderFlagPart } from './flag-parts';
import { Message } from './message';
import { MessageList, type MessageListProps } from './message-list';
import { MessagePart } from './message-part';
import { deleteChat, renameChat } from './mutations';
import { type ChatManifest, useChatProvider } from './provider';
import { ChatHistory, deriveChatTitle } from './chat-history';
import { FrogbotChatTransport, prepareChatRequest } from './transport';
import { useChatMessages } from './use-chat';
import type { ChatDocument } from './use-chats';
import { useChats } from './use-chats';

type ChatActions = {
  rename: (title: string) => Promise<void>;
  delete: () => Promise<void>;
};

export type ChatProps = {
  agent: string;
  model?: string;
  initialMessages?: UIMessage[];
  chatId?: string | number;
  defaultChatId?: string | number;
  onChatIdChange?: (chatId: string | number | undefined) => void;
  throttle?: number;
  emptyContent?: ReactNode;
  loadingContent?: ReactNode;
  headerSlot?: ReactNode;
  composerStartSlot?: ReactNode;
  composerEndSlot?: ReactNode;
  submitContent?: ReactNode;
  stopContent?: ReactNode;
  fallbackTitle?: string;
  errorContent?: (error: Error) => ReactNode;
  abortedContent?: ReactNode;
  warningContent?: ReactNode;
  renderChatActions?: (chat: ChatDocument, actions: ChatActions) => ReactNode;
  renderMessage?: MessageListProps['renderMessage'];
  panel?: ReactNode;
};

export function Chat(props: ChatProps) {
  const provider = useChatProvider();
  if (!provider) throw new Error('Chat requires ChatProvider');
  if (provider.loading) return props.loadingContent;
  if (provider.error) return props.errorContent?.(provider.error);
  if (!provider.manifest || !provider.manifest.chat.enabled) return props.emptyContent;
  return (
    <ChatOrchestrator
      {...props}
      chatIdControlled={Object.prototype.hasOwnProperty.call(props, 'chatId')}
      adapter={provider.adapter}
      sdk={provider.sdk}
      agents={provider.manifest.agents}
      filesSlug={provider.manifest.files.slug}
      messagesSlug={provider.manifest.chat.messagesSlug}
      chatsSlug={provider.manifest.chat.chatsSlug}
    />
  );
}

type ChatOrchestratorProps = ChatProps & {
  adapter: NonNullable<ReturnType<typeof useChatProvider>>['adapter'];
  sdk: NonNullable<ReturnType<typeof useChatProvider>>['sdk'];
  agents: ChatManifest['agents'];
  filesSlug: string;
  messagesSlug: string;
  chatsSlug: string;
  chatIdControlled: boolean;
};

function ChatOrchestrator({
  abortedContent,
  adapter,
  agent,
  agents,
  composerEndSlot,
  composerStartSlot,
  defaultChatId,
  emptyContent,
  errorContent,
  fallbackTitle = 'New chat',
  filesSlug,
    headerSlot,
    initialMessages,
  messagesSlug,
  model,
  onChatIdChange,
  panel,
  renderMessage,
  renderChatActions,
  sdk,
  stopContent = 'Stop',
  submitContent = 'Send',
  chatId: controlledChatId,
  chatIdControlled,
  chatsSlug,
  throttle,
  warningContent,
}: ChatOrchestratorProps) {
  const [activeChatId, setActiveChatId] = useControlledState<string | number | undefined>({
    controlled: chatIdControlled,
    defaultValue: defaultChatId,
    onChange: onChatIdChange,
    value: controlledChatId,
  });
  const [runtimeChatId, setRuntimeChatId] = useState(
    activeChatId === undefined ? `new:${agent}` : String(activeChatId),
  );
  const createdChatId = useRef<string | undefined>(undefined);
  const reportedChatId = useRef<string | undefined>(undefined);
  const previousAgent = useRef(agent);
  const history = useChatMessages({ sdk, messagesSlug, chatId: activeChatId });
  const chats = useChats({ sdk, agent, chatsSlug });
  const [aborted, setAborted] = useState(false);
  const transport = useMemo(
    () =>
      new FrogbotChatTransport({
        agentSlug: agent,
        sdk,
        onChatId: (nextChatId) => {
          createdChatId.current = nextChatId;
        },
        prepareSendMessagesRequest: prepareChatRequest(activeChatId, model),
      }),
    [activeChatId, agent, model, sdk],
  );
  let addToolOutput: ReturnType<typeof useChat>['addToolOutput'] | undefined;
  const chat = useChat({
    id: runtimeChatId,
    messages: initialMessages,
    transport,
    experimental_throttle: throttle,
    onToolCall: adapter.executeClientTool
      ? async ({ toolCall }) => {
          const output = await adapter.executeClientTool?.(toolCall.toolName, toolCall.input);
          await addToolOutput?.({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output,
          });
        }
      : undefined,
    onFinish: () => {
      if (!createdChatId.current) return;
      reportedChatId.current = createdChatId.current;
      setActiveChatId(createdChatId.current);
      createdChatId.current = undefined;
      chats.refresh();
    },
  });
  addToolOutput = chat.addToolOutput;

  const clearConversation = () => {
    createdChatId.current = undefined;
    reportedChatId.current = undefined;
    setRuntimeChatId(`new:${agent}`);
    chat.setMessages([]);
  };

  useEffect(() => {
    if (
      !history.loading &&
      history.loadedChatId !== undefined &&
      String(history.loadedChatId) === String(activeChatId) &&
      String(history.loadedChatId) !== reportedChatId.current
    ) {
      chat.setMessages(history.messages);
    }
  }, [activeChatId, history.loadedChatId, history.loading, history.messages, chat.setMessages]);

  useEffect(() => {
    if (!chatIdControlled) return;
    if (controlledChatId === undefined) {
      clearConversation();
      return;
    }
    if (String(controlledChatId) === reportedChatId.current) {
      reportedChatId.current = undefined;
      return;
    }
    if (String(controlledChatId) !== runtimeChatId) setRuntimeChatId(String(controlledChatId));
  }, [chatIdControlled, controlledChatId, runtimeChatId]);

  useEffect(() => {
    if (previousAgent.current === agent) return;
    previousAgent.current = agent;
    clearConversation();
    setActiveChatId(undefined);
  }, [agent]);

  const selectChat = (nextChatId: string | number) => {
    setAborted(false);
    reportedChatId.current = undefined;
    setRuntimeChatId(String(nextChatId));
    setActiveChatId(nextChatId);
  };
  const mutate = (chatDocument: ChatDocument): ChatActions => ({
    rename: async (title) => {
      await renameChat({ sdk, chatsSlug, chatId: chatDocument.id }, title);
      chats.refresh();
    },
    delete: async () => {
      await deleteChat({ sdk, messagesSlug, chatsSlug, chatId: chatDocument.id });
      if (String(activeChatId) === String(chatDocument.id)) {
        clearConversation();
        setActiveChatId(undefined);
      }
      chats.refresh();
    },
  });
  const submit = async (text: string, attachments: ComposerAttachment[]) => {
    setAborted(false);
    const parts = [
      ...attachments.map((attachment) =>
        'type' in attachment && attachment.type === 'paste'
          ? {
              type: 'data-paste' as const,
              data: { text: attachment.text, filename: attachment.filename },
            }
          : { type: 'file-reference' as const, ...attachment },
      ),
      ...(text ? [{ type: 'text' as const, text }] : []),
    ];
    const message: UIMessage = { id: '', role: 'user', parts: parts as UIMessage['parts'] };
    const metadata = await adapter.buildMetadata?.(message);
    await chat.sendMessage({ parts, metadata } as never);
  };
  const stop = () => {
    setAborted(true);
    void chat.stop();
  };
  const error = history.error ?? chats.error ?? chat.error;
  const displayedChats = (chats.docs ?? []).map((chatDocument) =>
    String(chatDocument.id) === String(activeChatId) && !chatDocument.title
      ? { ...chatDocument, title: deriveChatTitle(chat.messages, fallbackTitle) }
      : chatDocument,
  );
  const profile = agents.find(({ slug }) => slug === agent)?.profile;
  const displayName = profile?.name ?? agent;
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const defaultRenderMessage: MessageListProps['renderMessage'] = (message) => (
    <Message
      key={message.id}
      role={message.role}
      avatar={
        profile && message.role === 'assistant' ? (
          <div className="fb-chat__assistant-avatar">
            {profile.avatar ? (
              <img src={profile.avatar} alt={displayName} className="fb-chat__assistant-avatar-image" />
            ) : (
              initials
            )}
          </div>
        ) : undefined
      }
    >
      {message.parts.map((part, index) => (
        <MessagePart
          key={`${message.id}-${index}`}
          part={part}
          renderData={isFlagPart(part) ? renderFlagPart : undefined}
        />
      ))}
    </Message>
  );

  return (
    <ChatShell
      panel={panel}
      sidebar={
        <ChatHistory
          chats={displayedChats}
          activeChatId={activeChatId}
          fallbackTitle={fallbackTitle}
          onChatChange={selectChat}
          renderActions={
            renderChatActions
              ? (chatDocument) => renderChatActions(chatDocument, mutate(chatDocument))
              : undefined
          }
        />
      }
    >
      {headerSlot}
      {chat.messages.length === 0 && !history.loading ? (
        emptyContent
      ) : (
        <MessageList
          messages={chat.messages}
          renderMessage={renderMessage ?? defaultRenderMessage}
        />
      )}
      <div className="fb-chat__composer">
        <ChatStatus
          aborted={aborted}
          abortedContent={abortedContent}
          error={error}
          errorContent={errorContent}
          warningContent={warningContent}
        />
        <Composer
          sdk={sdk}
          filesSlug={filesSlug}
          pending={chat.status === 'submitted' || chat.status === 'streaming'}
          onStop={stop}
          onSubmit={submit}
          startSlot={composerStartSlot}
          endSlot={composerEndSlot}
          submitContent={submitContent}
          stopContent={stopContent}
        />
      </div>
    </ChatShell>
  );
}
