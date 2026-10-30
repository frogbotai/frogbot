'use client';

import { useChat } from '@ai-sdk/react';
import type { AgentManifestEntry, ChatManifest, TurnErrorCode } from '@frogbotai/protocol';
import {
  generateId,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from 'ai';
import { type ComponentType, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '../components/button.js';
import { useControlledState } from '../hooks/use-controlled-state.js';
import {
  ChatAdapterError,
  type ChatDocument,
  type ChatId,
  type ChatMessages,
  type ChatPlatformAdapter,
} from './adapter.js';
import type { ComposerAttachment, ComposerModelInput } from './attachments.js';
import { ChannelConversationNotice } from './channel-conversation-notice.js';
import { deriveChatTitle } from './chat-history.js';
import { ChatShell } from './chat-shell.js';
import { ChatStatus } from './chat-status.js';
import {
  Composer,
  type ComposerHandle,
  type ComposerQueued,
  type ComposerSubmission,
} from './composer/composer.js';
import { type ComposerMention, composerParts, type ComposerPrompt } from './composer/prompt.js';
import { isFlagPart, renderFlagPart } from './flag-parts.js';
import { Greeting, type GreetingProps } from './greeting.js';
import { Message } from './message.js';
import { MessageActions } from './message-actions.js';
import { MessageEditor } from './message-editor.js';
import { MessageList, type MessageListProps } from './message-list.js';
import { MessagePart } from './message-part.js';
import { useChatProvider } from './provider.js';
import { speechText } from './speech-text.js';
import { type ToolActions, ToolActionsContext } from './tool-actions.js';
import { ToolPart } from './tool-part.js';
import { resolveToolRenderer, type ToolPartValue, type ToolRenderer } from './tool-registry.js';
import { toChatError, turnErrorCode } from './turn-error.js';
import { useChatMessages } from './use-chat.js';
import { emitChatMutation, useChatDocument, useChats } from './use-chats.js';
import { useReadAloud } from './use-read-aloud.js';

const TURN_SYNC_ATTEMPTS = 120;
const TURN_SYNC_INTERVAL = 1_000;
const SILENT_TURN_ERRORS = new Set<TurnErrorCode>([
  'already-settled',
  'not-awaiting',
  'channel-chat',
]);

type ChatActions = {
  rename?: (title: string) => Promise<void>;
  delete?: () => Promise<void>;
};

type QueueEntry = {
  id: string;
  chatKey: string;
  queued: ComposerQueued;
  paused: boolean;
  steering: boolean;
};

const NEW_CHAT_KEY = 'new:';

function queuedText(queued: ComposerQueued) {
  if (queued.kind === 'command') return queued.text;

  const { attachments, prompt } = queued;

  if (prompt.text.trim()) return prompt.text;

  return attachments.length === 1 ? '1 attachment' : `${attachments.length} attachments`;
}

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
  reasoning?: string;
  initialMessages?: UIMessage[];
  initialChat?: ChatDocument;
  chatId?: string | number;
  defaultChatId?: string | number;
  onChatIdChange?: (chatId: string | number | undefined) => void;
  throttle?: number;
  emptyContent?: ReactNode;
  disabledContent?: ReactNode;
  greeting?: ComponentType<GreetingProps> | false;
  logo?: ReactNode;
  /** The logo that pulses below the thread while the agent works, when the agent has no avatar. */
  icon?: ReactNode;
  userName?: string;
  loadingContent?: ReactNode;
  headerSlot?: ReactNode;
  composerStartSlot?: ReactNode;
  composerEndSlot?: ReactNode;
  dockSlot?: ReactNode;
  dockBlocking?: boolean;
  onBeforeSubmit?: (prompt: ComposerSubmission) => boolean | Promise<boolean>;
  placeholder?: string;
  submitContent?: ReactNode;
  stopContent?: ReactNode;
  fallbackTitle?: string;
  errorContent?: ((error: Error) => ReactNode) | false;
  onError?: (error: Error) => void;
  abortedContent?: ReactNode;
  warningContent?: ReactNode;
  renderSidebar?: (context: ChatSidebarContext) => ReactNode;
  renderMessage?: MessageListProps['renderMessage'];
  userMessageActions?: ComponentType<MessageActionsSlotProps> | false;
  assistantMessageActions?: ComponentType<MessageActionsSlotProps> | false;
  panel?: ReactNode;
};

function isSilentTurnError(error: Error) {
  const code = turnErrorCode(error);

  return code !== undefined && SILENT_TURN_ERRORS.has(code);
}

function displayModelName({ entry, model }: { entry: AgentManifestEntry; model: string }) {
  const names: Partial<Record<string, string>> | undefined = entry.names;

  return names?.[model] ?? model.slice(model.indexOf('/') + 1);
}

function messageText(message: UIMessage) {
  return message.parts
    .filter(
      (part): part is Extract<(typeof message.parts)[number], { type: 'text' }> =>
        part.type === 'text',
    )
    .map((part) => part.text)
    .join('\n\n');
}

function messagePrompt(message: UIMessage): ComposerPrompt {
  const mentions = message.parts.flatMap((part) =>
    part.type === 'data-mention' ? [part.data as ComposerMention] : [],
  );

  return { text: messageText(message), mentions };
}

export function Chat(props: ChatProps) {
  const provider = useChatProvider();
  if (!provider) throw new Error('Chat requires ChatProvider');
  if (provider.loading) return props.loadingContent;
  if (provider.error) return props.errorContent ? props.errorContent(provider.error) : null;
  if (!provider.manifest) return props.disabledContent;

  const entry = provider.manifest.agents.find(({ slug }) => slug === props.agent);
  const model = entry?.models.find((id) => id === props.model) ?? entry?.defaultModel;

  return (
    <ChatInner
      {...props}
      modelInputs={entry && model ? entry.inputs?.[model] : undefined}
      modelName={entry && model ? displayModelName({ entry, model }) : undefined}
      chatIdControlled={Object.prototype.hasOwnProperty.call(props, 'chatId')}
      adapter={provider.adapter}
      agents={provider.manifest.agents}
      speak={provider.manifest.speak ? provider.adapter.speak : undefined}
      toolRenderers={provider.toolRenderers}
    />
  );
}

type ChatInnerProps = ChatProps & {
  adapter: ChatPlatformAdapter;
  agents: ChatManifest['agents'];
  chatIdControlled: boolean;
  modelInputs?: ComposerModelInput[];
  modelName?: string;
  speak?: ChatPlatformAdapter['speak'];
  toolRenderers: readonly ToolRenderer[];
};

function ChatInner({
  abortedContent,
  adapter,
  agent,
  agents,
  composerEndSlot,
  composerStartSlot,
  defaultChatId,
  dockBlocking = false,
  dockSlot,
  emptyContent,
  errorContent,
  fallbackTitle = 'Untitled',
  greeting: GreetingComponent = Greeting,
  headerSlot,
  icon,
  initialChat,
  initialMessages,
  logo,
  assistantMessageActions: AssistantMessageActions,
  model,
  modelInputs,
  modelName,
  onBeforeSubmit,
  onChatIdChange,
  onError,
  panel,
  placeholder,
  reasoning,
  renderMessage,
  renderSidebar,
  stopContent = 'Stop',
  submitContent = 'Send',
  chatId: controlledChatId,
  chatIdControlled,
  speak,
  throttle,
  toolRenderers,
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

  const chatKey = activeChatId === undefined ? runtimeChatId : String(activeChatId);

  const createdChatId = useRef<ChatId | undefined>(undefined);
  const reportedChatId = useRef<string | undefined>(undefined);
  const previousAgent = useRef(agent);
  const renderedAt = useRef(new Map<string, string>());
  const composerRef = useRef<HTMLDivElement>(null);
  const history = useChatMessages({ adapter, chatId: activeChatId });
  const chats = useChats({ adapter, agent });
  const activeChat = useChatDocument({
    adapter,
    chatId: activeChatId,
    initialData: initialChat,
  });

  const channel = activeChat.chat?.channel || undefined;
  const channelLabel = channel && (activeChat.chat?.channelLabel || channel);
  const isReadonly = channelLabel !== undefined;
  const [aborted, setAborted] = useState(false);
  const [actionError, setActionError] = useState<Error>();
  const [branching, setBranching] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string>();
  const [queued, setQueued] = useState<UIMessage[]>([]);
  const [entries, setEntryState] = useState<QueueEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [filled, setFilled] = useState(false);
  const entriesRef = useRef(entries);
  const runningRef = useRef(false);
  const stopped = useRef(false);
  const composerHandle = useRef<ComposerHandle>(null);
  const queuedRequest = useRef(false);
  const toolOutputAdded = useRef(false);
  const turnSync = useRef<AbortController | undefined>(undefined);
  const request = useRef({ chatId: activeChatId, model, reasoning });
  request.current = { chatId: activeChatId, model, reasoning };
  const transport = useMemo(
    () =>
      adapter.createTransport({
        agent,
        request: () => request.current,
        onChatId: (nextChatId) => {
          createdChatId.current = nextChatId;
          emitChatMutation();
        },
      }),
    [adapter, agent],
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

      if (part.type === 'data-steered') {
        const { messageId } = part.data as { messageId: string };

        dropEntries((entry) => entry.id === messageId);
      }
    },
    onFinish: ({ isAbort, isError }) => {
      endTurn(isError || (isAbort && !stopped.current));

      if (flushChatId()) window.setTimeout(emitChatMutation, 2_500);

      if (queuedRequest.current) {
        queuedRequest.current = false;

        return;
      }

      if (queued.length > 0) void syncTurn();
    },
    onError: (error) => {
      endTurn(true);
      flushChatId();

      const code = turnErrorCode(error);

      if (code) void recoverTurn(code);

      if (!isSilentTurnError(error)) onError?.(toChatError(error));
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

  function setEntries(update: (current: QueueEntry[]) => QueueEntry[]) {
    entriesRef.current = update(entriesRef.current);
    setEntryState(entriesRef.current);
  }

  function dropEntries(match: (entry: QueueEntry) => boolean) {
    const gone = entriesRef.current.filter(match);

    if (gone.length === 0) return;

    for (const entry of gone) composerHandle.current?.discard(entry.queued);

    setEntries((current) => current.filter((entry) => !match(entry)));
  }

  function pauseEntries() {
    setEntries((current) => current.map((entry) => ({ ...entry, paused: true })));
  }

  function endTurn(paused: boolean) {
    stopped.current = false;
    dropEntries((entry) => entry.steering);

    if (paused) pauseEntries();
  }

  function leaveChat() {
    dropEntries((entry) => entry.chatKey.startsWith(NEW_CHAT_KEY));
    pauseEntries();
  }

  function enqueue(next: ComposerQueued) {
    setEntries((current) => [
      ...current,
      { id: generateId(), chatKey, queued: next, paused: false, steering: false },
    ]);
  }

  function reportComposerError(error: Error, source: 'command' | 'message') {
    if (source === 'message') failAction(error, 'Message failed');
    else failAction(new Error(`Command failed: ${error.message}`), 'Command failed');
  }

  async function runEntry(entry: QueueEntry) {
    const { queued: next } = entry;

    runningRef.current = true;
    setRunning(true);
    setEntries((current) => current.filter(({ id }) => id !== entry.id));

    try {
      if (next.kind === 'message') {
        await submit(next.prompt, next.attachments);
        composerHandle.current?.discard(next);
      } else {
        await next.command.execute(next.input);
      }
    } catch (error) {
      if (next.kind === 'message') {
        setEntries((current) => [{ ...entry, paused: true }, ...current]);
      }

      pauseEntries();

      reportComposerError(
        error instanceof Error ? error : new Error(String(error)),
        next.kind === 'message' ? 'message' : 'command',
      );
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  function sendNow(entry: QueueEntry) {
    if (runningRef.current) return;

    setEntries((current) =>
      current.map((candidate) =>
        candidate.chatKey === entry.chatKey ? { ...candidate, paused: false } : candidate,
      ),
    );

    void runEntry(entry);
  }

  function editEntry(entry: QueueEntry) {
    if (!composerHandle.current?.edit(entry.queued)) return;

    setEntries((current) => current.filter(({ id }) => id !== entry.id));
  }

  async function steerEntry(entry: QueueEntry) {
    const chatId = createdChatId.current ?? request.current.chatId;
    const { queued: next } = entry;

    if (!adapter.steerMessage || chatId === undefined || next.kind !== 'message') return;

    const mark = (steering: boolean) =>
      setEntries((current) =>
        current.map((candidate) =>
          candidate.id === entry.id ? { ...candidate, steering } : candidate,
        ),
      );

    mark(true);

    const message: UIMessage = {
      id: entry.id,
      role: 'user',
      parts: composerParts(next.prompt, next.attachments) as UIMessage['parts'],
    };

    try {
      const metadata = await adapter.buildMetadata?.(message);

      await adapter.steerMessage(chatId, { ...message, metadata });
    } catch (error) {
      mark(false);
      failAction(error, 'Failed to steer');
    }
  }

  function failAction(error: unknown, fallback: string) {
    const actionError = toChatError(error instanceof Error ? error : new Error(fallback));

    setActionError(actionError);
    onError?.(actionError);
  }

  async function reloadMessages() {
    const chatId = request.current.chatId;
    const next: ChatMessages =
      chatId === undefined ? { messages: [], queued: [] } : await adapter.loadMessages(chatId);

    toolOutputAdded.current = false;
    chat.setMessages(next.messages);
    setQueued(next.queued);

    return next;
  }

  async function recoverTurn(code?: TurnErrorCode) {
    activeChat.refresh();

    try {
      await reloadMessages();
    } catch (error) {
      failAction(error, 'Failed to reload chat');

      return;
    }

    if (code && SILENT_TURN_ERRORS.has(code)) chat.clearError();
  }

  async function syncTurn() {
    const chatId = request.current.chatId;

    if (chatId === undefined) return;

    turnSync.current?.abort();

    if (!adapter.loadTurnState) {
      try {
        await reloadMessages();
      } catch (error) {
        failAction(error, 'Failed to reload chat');
      }

      return;
    }

    const controller = new AbortController();

    turnSync.current = controller;

    try {
      for (let attempt = 0; attempt < TURN_SYNC_ATTEMPTS; attempt++) {
        if (attempt > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, TURN_SYNC_INTERVAL));
        }

        if (controller.signal.aborted) return;

        const state = await adapter.loadTurnState(agent, chatId);

        if (state === 'running' || controller.signal.aborted) continue;

        const next = await reloadMessages();

        if (state === 'awaiting' || next.queued.length === 0) return;
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        failAction(error, 'Failed to reload chat');
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
    if (createdChatId.current === undefined) return false;

    const created = String(createdChatId.current);

    setEntries((current) =>
      current.map((entry) =>
        entry.chatKey.startsWith(NEW_CHAT_KEY) ? { ...entry, chatKey: created } : entry,
      ),
    );

    reportedChatId.current = created;
    setActiveChatId(createdChatId.current);
    createdChatId.current = undefined;
    chats.refresh();

    return true;
  }

  const clearConversation = () => {
    leaveChat();
    createdChatId.current = undefined;
    reportedChatId.current = undefined;
    setEditingMessageId(undefined);
    setQueued([]);
    setRuntimeChatId(`new:${agent}`);
    chat.setMessages([]);
  };

  const latest = useRef({ clearConversation, leaveChat, setActiveChatId });
  latest.current = { clearConversation, leaveChat, setActiveChatId };
  const { setMessages } = chat;

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
      setMessages(history.messages);
      setQueued(history.queued);
    }
  }, [
    activeChatId,
    history.loadedChatId,
    history.loading,
    history.messages,
    history.queued,
    setMessages,
  ]);

  useEffect(() => {
    if (!chatIdControlled) return;
    if (controlledChatId === undefined) {
      latest.current.clearConversation();

      return;
    }

    if (String(controlledChatId) === reportedChatId.current) {
      reportedChatId.current = undefined;

      return;
    }

    if (String(controlledChatId) !== runtimeChatId) {
      latest.current.leaveChat();
      setRuntimeChatId(String(controlledChatId));
    }
  }, [chatIdControlled, controlledChatId, runtimeChatId]);

  useEffect(() => {
    if (previousAgent.current === agent) return;
    previousAgent.current = agent;
    if (activeChatId !== undefined) return;
    latest.current.clearConversation();
    latest.current.setActiveChatId(undefined);
  }, [activeChatId, agent]);

  const selectChat = (nextChatId: string | number) => {
    leaveChat();
    setAborted(false);
    setEditingMessageId(undefined);
    setQueued([]);
    reportedChatId.current = undefined;
    setRuntimeChatId(String(nextChatId));
    setActiveChatId(nextChatId);
  };

  const mutate = (chatDocument: ChatDocument): ChatActions => ({
    rename: adapter.renameChat
      ? async (title) => {
          await adapter.renameChat?.(chatDocument.id, title);
          emitChatMutation();
          chats.refresh();
        }
      : undefined,
    delete: adapter.deleteChat
      ? async () => {
          await adapter.deleteChat?.(chatDocument.id);
          emitChatMutation();

          if (String(activeChatId) === String(chatDocument.id)) {
            clearConversation();
            setActiveChatId(undefined);
          }

          chats.refresh();
        }
      : undefined,
  });

  const submit = async (prompt: ComposerPrompt, attachments: ComposerAttachment[]) => {
    setAborted(false);

    const message: UIMessage = {
      id: '',
      role: 'user',
      parts: composerParts(prompt, attachments) as UIMessage['parts'],
    };

    const metadata = await adapter.buildMetadata?.(message);

    try {
      await chat.sendMessage({ parts: message.parts, metadata });
    } catch (error) {
      onError?.(toChatError(error instanceof Error ? error : new Error(String(error))));
    }
  };

  const stop = () => {
    setAborted(true);
    stopped.current = true;
    pauseEntries();
    void chat.stop();
  };

  const editMessage = async (message: UIMessage, prompt: ComposerPrompt) => {
    const parts = [
      ...message.parts.filter((part) => part.type !== 'text' && part.type !== 'data-mention'),
      ...composerParts(prompt, []),
    ] as UIMessage['parts'];

    const revisedMessage = { ...message, parts };
    const metadata = (await adapter.buildMetadata?.(revisedMessage)) ?? message.metadata;
    await chat.sendMessage({ messageId: message.id, parts, metadata });
    setEditingMessageId(undefined);
  };

  const branchMessage = async (message: UIMessage) => {
    if (activeChatId === undefined || !adapter.branchChat) return;
    setActionError(undefined);
    setBranching(true);
    try {
      const nextChatId = await adapter.branchChat(activeChatId, message.id);
      emitChatMutation();
      chats.refresh();
      selectChat(nextChatId);
    } catch (error) {
      failAction(error, 'Failed to branch chat');
    } finally {
      setBranching(false);
    }
  };

  const turnError = chat.error && !isSilentTurnError(chat.error) ? chat.error : undefined;
  const error =
    actionError ??
    history.error ??
    activeChat.error ??
    chats.error ??
    (turnError && toChatError(turnError));

  const pending = chat.status === 'submitted' || chat.status === 'streaming';
  const lastMessage = chat.messages.at(-1);
  const readAloud = useReadAloud({ speak });
  const { activeId: readAloudId, stop: stopReadAloud } = readAloud;
  const readAloudStartText = useRef<string | undefined>(undefined);
  const readAloudMessage = chat.messages.find(({ id }) => id === readAloudId);
  const readAloudText = readAloudMessage ? messageText(readAloudMessage) : undefined;

  useEffect(() => {
    stopReadAloud();
  }, [chatKey, stopReadAloud]);

  useEffect(() => {
    if (editingMessageId !== undefined || pending) stopReadAloud();
  }, [editingMessageId, pending, stopReadAloud]);

  useEffect(() => {
    if (readAloudId !== undefined && readAloudText !== readAloudStartText.current) stopReadAloud();
  }, [readAloudId, readAloudText, stopReadAloud]);

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

  const dockedParts = useMemo(
    () =>
      pendingToolCallIds.size > 0 && lastMessage && !aborted && chat.status !== 'error'
        ? lastMessage.parts
            .filter(isToolUIPart)
            .filter(
              (part) =>
                pendingToolCallIds.has(part.toolCallId) &&
                resolveToolRenderer(toolRenderers, getToolName(part)) !== undefined,
            )
        : [],
    [aborted, chat.status, lastMessage, pendingToolCallIds, toolRenderers],
  );

  const dockedToolCallIds = useMemo(
    () => new Set(dockedParts.map(({ toolCallId }) => toolCallId)),
    [dockedParts],
  );

  const visibleEntries = entries.filter((entry) => entry.chatKey === chatKey);
  const nextEntry = visibleEntries.find(({ paused, steering }) => !paused && !steering);
  const busy = pending || running || isReadonly || dockBlocking || dockedParts.length > 0;
  const drainBlocked = busy || chat.status !== 'ready' || pendingToolCallIds.size > 0;

  useEffect(() => {
    if (drainBlocked || !nextEntry || toolOutputAdded.current || runningRef.current) return;

    void runEntry(nextEntry);
  });

  const dismissPendingToolCall = async (toolCallId: string) => {
    const chatId = request.current.chatId;

    if (chatId === undefined || !adapter.dismissToolCall) return;

    setActionError(undefined);

    try {
      const settlement = await adapter.dismissToolCall(agent, chatId, toolCallId);

      if (pendingToolCallIds.size > 1) await reloadMessages();
      else applyToolPart(settlement.part);

      if (queued.length > 0) void syncTurn();
    } catch (error) {
      if (error instanceof ChatAdapterError && error.code === 'conflict') {
        await recoverTurn();

        return;
      }

      failAction(error, 'Failed to dismiss');
    }
  };

  const dockActions: ToolActions = {
    addToolOutput,
    dismissToolCall: adapter.dismissToolCall ? dismissPendingToolCall : undefined,
    pendingToolCallIds,
    isReadonly,
    channelLabel,
  };

  const toolActions: ToolActions = { ...dockActions, dockedToolCallIds };

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
    const streaming = pending && message.role === 'assistant' && message.id === lastMessage?.id;
    const defaultActions = !streaming ? (
      <MessageActions
        text={text}
        timestamp={timestampFor(message)}
        timestampPlacement={message.role === 'user' ? 'start' : 'end'}
        onBranch={
          message.role === 'assistant' &&
          !pending &&
          activeChatId !== undefined &&
          adapter.branchChat
            ? () => branchMessage(message)
            : undefined
        }
        onEdit={
          message.role === 'user' && !pending && !isReadonly
            ? () => setEditingMessageId(message.id)
            : undefined
        }
        readAloud={
          message.role === 'assistant' && !pending && speak && speechText(text)
            ? {
                active: readAloud.activeId === message.id && readAloud.status !== 'idle',
                error: readAloud.error?.id === message.id ? readAloud.error.message : undefined,
                onToggle: () => {
                  readAloudStartText.current = text;
                  readAloud.toggle(message.id, text);
                },
              }
            : undefined
        }
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
            initialValue={messagePrompt(message)}
            onCancel={() => setEditingMessageId(undefined)}
            onSubmit={(prompt) => editMessage(message, prompt)}
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
            icon={profile?.avatar ? <img src={profile.avatar} alt="" /> : icon}
            messages={chat.messages}
            pending={pending}
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
          {visibleEntries.length > 0 && (
            <ul className="fb-chat__queued" aria-label="Queued messages">
              {visibleEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="fb-chat__queued-message"
                  data-state={entry.steering ? 'steering' : entry.paused ? 'paused' : 'queued'}
                >
                  <span className="fb-chat__queued-label">
                    {entry.steering ? 'Steering' : entry.paused ? 'Paused' : 'Queued'}
                  </span>
                  <span className="fb-chat__queued-text">{queuedText(entry.queued)}</span>
                  {!entry.steering && (
                    <span className="fb-chat__queued-actions">
                      {pending && adapter.steerMessage && entry.queued.kind === 'message' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void steerEntry(entry)}
                        >
                          Steer
                        </Button>
                      )}
                      {entry.paused && !busy && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => sendNow(entry)}
                        >
                          Send now
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={filled}
                        onClick={() => editEntry(entry)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => dropEntries(({ id }) => id === entry.id)}
                      >
                        Remove
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(dockedParts.length > 0 || Boolean(dockSlot)) && (
            <div className="fb-chat__dock">
              {dockedParts.length > 0 && (
                <ToolActionsContext value={dockActions}>
                  {dockedParts.map((part) => (
                    <ToolPart key={part.toolCallId} part={part} />
                  ))}
                </ToolActionsContext>
              )}
              {dockSlot}
            </div>
          )}
          {channelLabel ? (
            <ChannelConversationNotice
              channelLabel={channelLabel}
              branching={branching}
              onBranch={
                lastMessage && adapter.branchChat ? () => branchMessage(lastMessage) : undefined
              }
            />
          ) : (
            <Composer
              ref={composerHandle}
              adapter={adapter}
              modelInputs={modelInputs}
              modelName={modelName}
              hidden={dockBlocking || dockedParts.length > 0}
              pending={pending}
              queueing={pending || running}
              onBeforeSubmit={onBeforeSubmit}
              onError={reportComposerError}
              onFilledChange={setFilled}
              onQueue={enqueue}
              onStop={stop}
              onSubmit={submit}
              placeholder={placeholder}
              startSlot={composerStartSlot}
              endSlot={composerEndSlot}
              submitContent={submitContent}
              stopContent={stopContent}
            />
          )}
        </div>
      </ChatShell>
    </ToolActionsContext>
  );
}
