'use client';

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { type ComponentType, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { useControlledState } from '../hooks/use-controlled-state';
import type { ComposerAttachment } from './attachments';
import { deriveChatTitle } from './chat-history';
import { ChatShell } from './chat-shell';
import { ChatStatus } from './chat-status';
import { Composer } from './composer';
import { isFlagPart, renderFlagPart } from './flag-parts';
import { Greeting, type GreetingProps } from './greeting';
import { Message } from './message';
import { MessageActions } from './message-actions';
import { MessageEditor } from './message-editor';
import { MessageList, type MessageListProps } from './message-list';
import { MessagePart } from './message-part';
import { branchChat, deleteChat, renameChat } from './mutations';
import { type ChatManifest, useChatProvider } from './provider';
import { FrogbotChatTransport, prepareChatRequest } from './transport';
import { useChatMessages } from './use-chat';
import type { ChatDocument } from './use-chats';
import { useChats } from './use-chats';

type ChatActions = {
  rename: (title: string) => Promise<void>;
  delete: () => Promise<void>;
};

export type ChatSidebarContext = {
  chats: ChatDocument[];
  activeChatId: string | number | undefined;
  selectChat: (chatId: string | number) => void;
  actions: (chat: ChatDocument) => ChatActions;
};

export type MessageActionsSlotProps = {
  defaultActions: ReactNode;
  message: UIMessage;
  pending: boolean;
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
  disabledContent?: ReactNode;
  greeting?: ComponentType<GreetingProps> | false;
  logo?: ReactNode;
  userName?: string;
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
  renderSidebar?: (context: ChatSidebarContext) => ReactNode;
  renderMessage?: MessageListProps['renderMessage'];
  userMessageActions?: ComponentType<MessageActionsSlotProps> | false;
  assistantMessageActions?: ComponentType<MessageActionsSlotProps> | false;
  panel?: ReactNode;
};

export function Chat(props: ChatProps) {
  const provider = useChatProvider();
  if (!provider) throw new Error('Chat requires ChatProvider');
  if (provider.loading) return props.loadingContent;
  if (provider.error) return props.errorContent?.(provider.error);
  if (!provider.manifest || !provider.manifest.chat.enabled) return props.disabledContent;
  return (
    <ChatInner
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

type ChatInnerProps = ChatProps & {
  adapter: NonNullable<ReturnType<typeof useChatProvider>>['adapter'];
  sdk: NonNullable<ReturnType<typeof useChatProvider>>['sdk'];
  agents: ChatManifest['agents'];
  filesSlug: string;
  messagesSlug: string;
  chatsSlug: string;
  chatIdControlled: boolean;
};

function ChatInner({
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
  greeting: GreetingComponent = Greeting,
  headerSlot,
  initialMessages,
  logo,
  messagesSlug,
  assistantMessageActions: AssistantMessageActions,
  model,
  onChatIdChange,
  panel,
  renderMessage,
  renderSidebar,
  sdk,
  stopContent = 'Stop',
  submitContent = 'Send',
  chatId: controlledChatId,
  chatIdControlled,
  chatsSlug,
  throttle,
  userName,
  warningContent,
  userMessageActions: UserMessageActions,
}: ChatInnerProps) {
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
  const renderedAt = useRef(new Map<string, string>());
  const history = useChatMessages({ sdk, messagesSlug, chatId: activeChatId });
  const chats = useChats({ sdk, agent, chatsSlug });
  const [aborted, setAborted] = useState(false);
  const [branchError, setBranchError] = useState<Error>();
  const [editingMessageId, setEditingMessageId] = useState<string>();
  const request = useRef({ chatId: activeChatId, model });
  request.current = { chatId: activeChatId, model };
  const transport = useMemo(
    () =>
      new FrogbotChatTransport({
        agentSlug: agent,
        sdk,
        onChatId: (nextChatId) => {
          createdChatId.current = nextChatId;
        },
        prepareSendMessagesRequest: prepareChatRequest(
          () => request.current.chatId,
          () => request.current.model,
        ),
      }),
    [agent, sdk],
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
      flushChatId();
    },
    onError: () => {
      flushChatId();
    },
  });
  addToolOutput = chat.addToolOutput;

  function flushChatId() {
    if (!createdChatId.current) return;
    reportedChatId.current = createdChatId.current;
    setActiveChatId(createdChatId.current);
    createdChatId.current = undefined;
    chats.refresh();
  }

  const clearConversation = () => {
    createdChatId.current = undefined;
    reportedChatId.current = undefined;
    setEditingMessageId(undefined);
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
    if (activeChatId !== undefined) return;
    clearConversation();
    setActiveChatId(undefined);
  }, [activeChatId, agent]);

  const selectChat = (nextChatId: string | number) => {
    setAborted(false);
    setEditingMessageId(undefined);
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
  const editMessage = async (message: UIMessage, text: string) => {
    const parts = [
      ...message.parts.filter((part) => part.type !== 'text'),
      { type: 'text' as const, text },
    ] as UIMessage['parts'];
    const revisedMessage = { ...message, parts };
    const metadata = (await adapter.buildMetadata?.(revisedMessage)) ?? message.metadata;
    await chat.sendMessage({ messageId: message.id, parts, metadata } as never);
    setEditingMessageId(undefined);
  };
  const branchMessage = async (message: UIMessage) => {
    if (activeChatId === undefined) return;
    setBranchError(undefined);
    try {
      const nextChatId = await branchChat({ sdk, chatId: activeChatId }, message.id);
      chats.refresh();
      selectChat(nextChatId);
    } catch (error) {
      setBranchError(error instanceof Error ? error : new Error('Failed to branch chat'));
    }
  };
  const error = branchError ?? history.error ?? chats.error ?? chat.error;
  const pending = chat.status === 'submitted' || chat.status === 'streaming';
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
  const timestampFor = (message: UIMessage) => {
    const createdAt = (message.metadata as { createdAt?: unknown } | undefined)?.createdAt;
    if (typeof createdAt === 'string' || typeof createdAt === 'number') return createdAt;
    const seen = renderedAt.current.get(message.id);
    if (seen) return seen;
    const now = new Date().toISOString();
    renderedAt.current.set(message.id, now);
    return now;
  };
  const defaultRenderMessage: MessageListProps['renderMessage'] = (message) => {
    const text = message.parts
      .filter(
        (part): part is Extract<(typeof message.parts)[number], { type: 'text' }> =>
          part.type === 'text',
      )
      .map((part) => part.text)
      .join('\n\n');
    const defaultActions = !pending ? (
      <MessageActions
        text={text}
        timestamp={timestampFor(message)}
        timestampPlacement={message.role === 'user' ? 'start' : 'end'}
        onBranch={
          message.role === 'assistant' && activeChatId !== undefined
            ? () => branchMessage(message)
            : undefined
        }
        onEdit={message.role === 'user' ? () => setEditingMessageId(message.id) : undefined}
      />
    ) : null;
    const MessageActionsSlot =
      message.role === 'user'
        ? UserMessageActions
        : message.role === 'assistant'
          ? AssistantMessageActions
          : false;
    const actions =
      (message.role !== 'user' && message.role !== 'assistant') ||
      editingMessageId === message.id ||
      MessageActionsSlot === false ? null : MessageActionsSlot ? (
        <MessageActionsSlot message={message} pending={pending} defaultActions={defaultActions} />
      ) : (
        defaultActions
      );

    return (
      <Message
        key={message.id}
        role={message.role}
        actions={actions}
        className={editingMessageId === message.id ? 'fb-message--editing' : undefined}
        avatar={
          profile && message.role === 'assistant' ? (
            <div className="fb-chat__assistant-avatar">
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt={displayName}
                  className="fb-chat__assistant-avatar-image"
                />
              ) : (
                initials
              )}
            </div>
          ) : undefined
        }
      >
        {editingMessageId === message.id ? (
          <MessageEditor
            initialValue={text}
            onCancel={() => setEditingMessageId(undefined)}
            onSubmit={(value) => editMessage(message, value)}
          />
        ) : (
          message.parts.map((part, index) => (
            <MessagePart
              key={`${message.id}-${index}`}
              part={part}
              renderData={isFlagPart(part) ? renderFlagPart : undefined}
            />
          ))
        )}
      </Message>
    );
  };

  return (
    <ChatShell
      panel={panel}
      sidebar={renderSidebar?.({
        chats: displayedChats,
        activeChatId,
        selectChat,
        actions: mutate,
      })}
    >
      {headerSlot}
      {chat.messages.length === 0 && !history.loading ? (
        <div className="fb-chat__empty">
          {emptyContent ??
            (GreetingComponent === false ? null : (
              <GreetingComponent
                avatar={profile?.avatar}
                logo={logo}
                name={displayName}
                userName={userName}
              />
            ))}
        </div>
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
          pending={pending}
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
