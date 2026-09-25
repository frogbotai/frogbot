'use client';

import { useChat } from '@ai-sdk/react';
import { FrogBotSDKError } from '@frogbotai/sdk';
import { isToolUIPart, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';
import type { TurnErrorCode } from 'frogbot';
import { type ComponentType, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { useControlledState } from '../hooks/use-controlled-state.js';
import type { ComposerAttachment } from './attachments.js';
import { deriveChatTitle } from './chat-history.js';
import { ChatShell } from './chat-shell.js';
import { ChatStatus } from './chat-status.js';
import { Composer } from './composer.js';
import { isFlagPart, renderFlagPart } from './flag-parts.js';
import { Greeting, type GreetingProps } from './greeting.js';
import { Message } from './message.js';
import { MessageActions } from './message-actions.js';
import { MessageEditor } from './message-editor.js';
import { MessageList, type MessageListProps } from './message-list.js';
import { MessagePart } from './message-part.js';
import { branchChat, deleteChat, dismissToolCall, renameChat } from './mutations.js';
import { type ChatManifest, useChatProvider } from './provider.js';
import { type ToolActions, ToolActionsContext } from './tool-actions.js';
import type { ToolPartValue } from './tool-registry.js';
import { FrogBotChatTransport, prepareChatRequest, turnErrorCode } from './transport.js';
import { loadChatMessages, loadTurnState, useChatMessages } from './use-chat.js';
import type { ChatDocument } from './use-chats.js';
import { emitChatMutation, useChats } from './use-chats.js';

const TURN_SYNC_ATTEMPTS = 120;
const TURN_SYNC_INTERVAL = 1_000;

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

function messageText(message: UIMessage) {
  return message.parts
    .filter(
      (part): part is Extract<(typeof message.parts)[number], { type: 'text' }> =>
        part.type === 'text',
    )
    .map((part) => part.text)
    .join('\n\n');
}

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
      assetsSlug={provider.manifest.chat.assetsSlug}
      messagesSlug={provider.manifest.chat.messagesSlug}
      chatsSlug={provider.manifest.chat.chatsSlug}
    />
  );
}

type ChatInnerProps = ChatProps & {
  adapter: NonNullable<ReturnType<typeof useChatProvider>>['adapter'];
  sdk: NonNullable<ReturnType<typeof useChatProvider>>['sdk'];
  agents: ChatManifest['agents'];
  assetsSlug: string;
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
  fallbackTitle = 'Untitled',
  assetsSlug,
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
  const composerRef = useRef<HTMLDivElement>(null);
  const history = useChatMessages({ sdk, messagesSlug, chatId: activeChatId });
  const chats = useChats({ sdk, agent, chatsSlug });
  const [aborted, setAborted] = useState(false);
  const [actionError, setActionError] = useState<Error>();
  const [editingMessageId, setEditingMessageId] = useState<string>();
  const [queued, setQueued] = useState<UIMessage[]>([]);
  const queuedRequest = useRef(false);
  const toolOutputAdded = useRef(false);
  const turnSync = useRef<AbortController | undefined>(undefined);
  const request = useRef({ chatId: activeChatId, model });
  request.current = { chatId: activeChatId, model };
  const transport = useMemo(
    () =>
      new FrogBotChatTransport({
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
  const chat = useChat({
    id: runtimeChatId,
    messages: initialMessages,
    transport,
    experimental_throttle: throttle,
    sendAutomaticallyWhen: ({ messages }) => {
      if (!toolOutputAdded.current || !lastAssistantMessageIsCompleteWithToolCalls({ messages })) {
        return false;
      }

      toolOutputAdded.current = false;

      return true;
    },
    onToolCall: adapter.executeClientTool
      ? async ({ toolCall }) => {
          const output = await adapter.executeClientTool?.(toolCall.toolName, toolCall.input);
          await addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output,
          });
        }
      : undefined,
    onData: (part) => {
      if (part.type === 'data-queued') queueMessage((part.data as { messageId: string }).messageId);
    },
    onFinish: () => {
      if (flushChatId()) window.setTimeout(emitChatMutation, 2_500);

      if (queuedRequest.current) {
        queuedRequest.current = false;

        return;
      }

      if (queued.length > 0) void syncTurn();
    },
    onError: (error) => {
      flushChatId();

      const code = turnErrorCode(error);

      if (code) void recoverTurn(code);
    },
  });

  async function addToolOutput(options: Parameters<ToolActions['addToolOutput']>[0]) {
    toolOutputAdded.current = true;

    await chat.addToolOutput(options);
  }

  function queueMessage(messageId: string) {
    queuedRequest.current = true;

    chat.setMessages((messages) => {
      const message = messages.find(({ id }) => id === messageId);

      if (message) setQueued((current) => [...current, message]);

      return messages.filter(({ id }) => id !== messageId);
    });
  }

  async function reloadMessages() {
    const next = await loadChatMessages({ sdk, messagesSlug, chatId: request.current.chatId });

    toolOutputAdded.current = false;
    chat.setMessages(next.messages);
    setQueued(next.queued);

    return next;
  }

  async function recoverTurn(code?: TurnErrorCode) {
    try {
      await reloadMessages();
    } catch (error) {
      setActionError(error instanceof Error ? error : new Error('Failed to reload chat'));

      return;
    }

    if (code === 'already-settled' || code === 'not-awaiting') chat.clearError();
  }

  async function syncTurn() {
    const chatId = request.current.chatId;

    if (chatId === undefined) return;

    turnSync.current?.abort();

    const controller = new AbortController();

    turnSync.current = controller;

    try {
      for (let attempt = 0; attempt < TURN_SYNC_ATTEMPTS; attempt++) {
        if (attempt > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, TURN_SYNC_INTERVAL));
        }

        if (controller.signal.aborted) return;

        const state = await loadTurnState({ sdk, agent, chatId });

        if (state === 'running' || controller.signal.aborted) continue;

        const next = await reloadMessages();

        if (state === 'awaiting' || next.queued.length === 0) return;
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setActionError(error instanceof Error ? error : new Error('Failed to reload chat'));
      }
    }
  }

  function applyToolPart(part: ToolPartValue) {
    const replace = (candidate: UIMessage['parts'][number]) =>
      isToolUIPart(candidate) && candidate.toolCallId === part.toolCallId
        ? (part as UIMessage['parts'][number])
        : candidate;

    chat.setMessages((messages) =>
      messages.map((message) => ({ ...message, parts: message.parts.map(replace) })),
    );
  }

  function flushChatId() {
    if (!createdChatId.current) return false;
    reportedChatId.current = createdChatId.current;
    setActiveChatId(createdChatId.current);
    createdChatId.current = undefined;
    chats.refresh();
    return true;
  }

  const clearConversation = () => {
    createdChatId.current = undefined;
    reportedChatId.current = undefined;
    setEditingMessageId(undefined);
    setQueued([]);
    setRuntimeChatId(`new:${agent}`);
    chat.setMessages([]);
  };

  useEffect(
    () => () => {
      toolOutputAdded.current = false;
      turnSync.current?.abort();
    },
    [runtimeChatId],
  );

  useEffect(() => {
    const node = composerRef.current;
    const main = node?.parentElement;
    if (!node || !main) return;
    const observer = new ResizeObserver(() => {
      main.style.setProperty('--fb-composer-height', `${node.offsetHeight}px`);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      main.style.removeProperty('--fb-composer-height');
    };
  }, []);

  useEffect(() => {
    if (
      !history.loading &&
      history.loadedChatId !== undefined &&
      String(history.loadedChatId) === String(activeChatId) &&
      String(history.loadedChatId) !== reportedChatId.current
    ) {
      chat.setMessages(history.messages);
      setQueued(history.queued);
    }
  }, [
    activeChatId,
    history.loadedChatId,
    history.loading,
    history.messages,
    history.queued,
    chat.setMessages,
  ]);

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
    setQueued([]);
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
    setActionError(undefined);
    try {
      const nextChatId = await branchChat({ sdk, chatId: activeChatId }, message.id);
      chats.refresh();
      selectChat(nextChatId);
    } catch (error) {
      setActionError(error instanceof Error ? error : new Error('Failed to branch chat'));
    }
  };
  const error = actionError ?? history.error ?? chats.error ?? chat.error;
  const pending = chat.status === 'submitted' || chat.status === 'streaming';
  const lastMessage = chat.messages.at(-1);
  const pendingToolCallIds = useMemo(
    () =>
      new Set(
        !pending && lastMessage?.role === 'assistant'
          ? lastMessage.parts
              .filter(isToolUIPart)
              .filter(({ state }) => state === 'input-available')
              .map(({ toolCallId }) => toolCallId)
          : [],
      ),
    [lastMessage, pending],
  );
  const dismissPendingToolCall = async (toolCallId: string) => {
    const chatId = request.current.chatId;

    if (chatId === undefined) return;

    setActionError(undefined);

    try {
      const settlement = await dismissToolCall({ sdk, agent, chatId }, toolCallId);

      if (pendingToolCallIds.size > 1) await reloadMessages();
      else applyToolPart(settlement.part);

      if (queued.length > 0) void syncTurn();
    } catch (error) {
      if (error instanceof FrogBotSDKError && error.status === 409) {
        await recoverTurn();

        return;
      }

      setActionError(error instanceof Error ? error : new Error('Failed to dismiss'));
    }
  };
  const toolActions: ToolActions = {
    addToolOutput,
    dismissToolCall: dismissPendingToolCall,
    pendingToolCallIds,
  };
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
    const text = messageText(message);
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
    <ToolActionsContext value={toolActions}>
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
        <div ref={composerRef} className="fb-chat__composer">
          <ChatStatus
            aborted={aborted}
            abortedContent={abortedContent}
            error={error}
            errorContent={errorContent}
            warningContent={warningContent}
          />
          {queued.length > 0 && (
            <div className="fb-chat__queued" role="status">
              {queued.map((message) => (
                <div key={message.id} className="fb-chat__queued-message">
                  <span className="fb-chat__queued-label">Queued</span>
                  <span className="fb-chat__queued-text">{messageText(message)}</span>
                </div>
              ))}
            </div>
          )}
          <Composer
            sdk={sdk}
            assetsSlug={assetsSlug}
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
    </ToolActionsContext>
  );
}
