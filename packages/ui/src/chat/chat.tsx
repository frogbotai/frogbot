'use client'

import { useChat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { type ReactNode,useEffect, useMemo, useRef, useState } from 'react'

import { useControlledState } from '../hooks/use-controlled-state'
import { ChatShell } from './chat-shell'
import { ChatStatus } from './chat-status'
import type { FileReference } from './attachments'
import { Composer } from './composer'
import { Message } from './message'
import { MessageList, type MessageListProps } from './message-list'
import { MessagePart } from './message-part'
import { deleteThread, renameThread } from './mutations'
import { type ChatManifest, useChatProvider } from './provider'
import { deriveThreadTitle, ThreadHistory } from './thread-history'
import { FrogbotChatTransport, prepareChatRequest } from './transport'
import { useThread } from './use-thread'
import type { ThreadDocument } from './use-threads'
import { useThreads } from './use-threads'

type ThreadActions = {
  rename: (title: string) => Promise<void>
  delete: () => Promise<void>
}

export type ChatProps = {
  agent: string
  threadId?: string | number
  defaultThreadId?: string | number
  onThreadIdChange?: (threadId: string | number | undefined) => void
  throttle?: number
  emptyContent?: ReactNode
  loadingContent?: ReactNode
  headerSlot?: ReactNode
  composerStartSlot?: ReactNode
  composerEndSlot?: ReactNode
  submitContent?: ReactNode
  stopContent?: ReactNode
  fallbackTitle?: string
  errorContent?: (error: Error) => ReactNode
  abortedContent?: ReactNode
  warningContent?: ReactNode
  renderThreadActions?: (thread: ThreadDocument, actions: ThreadActions) => ReactNode
  renderMessage?: MessageListProps['renderMessage']
  panel?: ReactNode
}

export function Chat(props: ChatProps) {
  const provider = useChatProvider()
  if (!provider) throw new Error('Chat requires ChatProvider')
  if (provider.loading) return props.loadingContent
  if (provider.error) return props.errorContent?.(provider.error)
  if (!provider.manifest || !provider.manifest.chat.enabled) return props.emptyContent
  return <ChatOrchestrator {...props} threadIdControlled={Object.prototype.hasOwnProperty.call(props, 'threadId')} adapter={provider.adapter} sdk={provider.sdk} agents={provider.manifest.agents} filesSlug={provider.manifest.files.slug} messagesSlug={provider.manifest.chat.messagesSlug} threadsSlug={provider.manifest.chat.threadsSlug} />
}

type ChatOrchestratorProps = ChatProps & {
  adapter: NonNullable<ReturnType<typeof useChatProvider>>['adapter']
  sdk: NonNullable<ReturnType<typeof useChatProvider>>['sdk']
  agents: ChatManifest['agents']
  filesSlug: string
  messagesSlug: string
  threadsSlug: string
  threadIdControlled: boolean
}

function ChatOrchestrator({ abortedContent, adapter, agent, agents, composerEndSlot, composerStartSlot, defaultThreadId, emptyContent, errorContent, fallbackTitle = 'New chat', filesSlug, headerSlot, messagesSlug, onThreadIdChange, panel, renderMessage, renderThreadActions, sdk, stopContent = 'Stop', submitContent = 'Send', threadId: controlledThreadId, threadIdControlled, threadsSlug, throttle, warningContent }: ChatOrchestratorProps) {
  const [threadId, setThreadId] = useControlledState<string | number | undefined>({ controlled: threadIdControlled, defaultValue: defaultThreadId, onChange: onThreadIdChange, value: controlledThreadId })
  const [chatId, setChatId] = useState(threadId === undefined ? `new:${agent}` : String(threadId))
  const createdThreadId = useRef<string | undefined>(undefined)
  const reportedThreadId = useRef<string | undefined>(undefined)
  const previousAgent = useRef(agent)
  const history = useThread({ sdk, messagesSlug, threadId })
  const threads = useThreads({ sdk, agent, threadsSlug })
  const [aborted, setAborted] = useState(false)
  const transport = useMemo(() => new FrogbotChatTransport({
    agentSlug: agent,
    sdk,
    onThreadId: (nextThreadId) => { createdThreadId.current = nextThreadId },
    prepareSendMessagesRequest: prepareChatRequest(threadId),
  }), [agent, sdk, threadId])
  let addToolOutput: ReturnType<typeof useChat>['addToolOutput'] | undefined
  const chat = useChat({
    id: chatId,
    transport,
    experimental_throttle: throttle,
    onToolCall: adapter.executeClientTool ? async ({ toolCall }) => {
      const output = await adapter.executeClientTool?.(toolCall.toolName, toolCall.input)
      await addToolOutput?.({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output })
    } : undefined,
    onFinish: () => {
      if (!createdThreadId.current) return
      reportedThreadId.current = createdThreadId.current
      setThreadId(createdThreadId.current)
      createdThreadId.current = undefined
      threads.refresh()
    },
  })
  addToolOutput = chat.addToolOutput

  const clearConversation = () => {
    createdThreadId.current = undefined
    reportedThreadId.current = undefined
    setChatId(`new:${agent}`)
    chat.setMessages([])
  }

  useEffect(() => {
    if (!history.loading && history.loadedThreadId !== undefined && String(history.loadedThreadId) === String(threadId) && String(history.loadedThreadId) !== reportedThreadId.current) chat.setMessages(history.messages)
  }, [history.loadedThreadId, history.loading, history.messages, threadId, chat.setMessages])

  useEffect(() => {
    if (!threadIdControlled) return
    if (controlledThreadId === undefined) {
      clearConversation()
      return
    }
    if (String(controlledThreadId) === reportedThreadId.current) {
      reportedThreadId.current = undefined
      return
    }
    if (String(controlledThreadId) !== chatId) setChatId(String(controlledThreadId))
  }, [chatId, controlledThreadId, threadIdControlled])

  useEffect(() => {
    if (previousAgent.current === agent) return
    previousAgent.current = agent
    clearConversation()
    setThreadId(undefined)
  }, [agent])

  const selectThread = (nextThreadId: string | number) => {
    setAborted(false)
    reportedThreadId.current = undefined
    setChatId(String(nextThreadId))
    setThreadId(nextThreadId)
  }
  const mutate = (thread: ThreadDocument): ThreadActions => ({
    rename: async (title) => {
      await renameThread({ sdk, threadsSlug, threadId: thread.id }, title)
      threads.refresh()
    },
    delete: async () => {
      await deleteThread({ sdk, messagesSlug, threadsSlug, threadId: thread.id })
      if (String(threadId) === String(thread.id)) {
        clearConversation()
        setThreadId(undefined)
      }
      threads.refresh()
    },
  })
  const submit = async (text: string, attachments: FileReference[]) => {
    setAborted(false)
    const parts = [
      ...attachments.map((attachment) => ({ type: 'file-reference' as const, ...attachment })),
      ...(text ? [{ type: 'text' as const, text }] : []),
    ]
    const message: UIMessage = { id: '', role: 'user', parts: parts as UIMessage['parts'] }
    const metadata = await adapter.buildMetadata?.(message)
    await chat.sendMessage({ parts, metadata } as never)
  }
  const stop = () => {
    setAborted(true)
    void chat.stop()
  }
  const error = history.error ?? threads.error ?? chat.error
  const displayedThreads = (threads.docs ?? []).map((thread) => String(thread.id) === String(threadId) && !thread.title ? { ...thread, title: deriveThreadTitle(chat.messages, fallbackTitle) } : thread)
  const profile = agents.find(({ slug }) => slug === agent)?.profile
  const displayName = profile?.name ?? agent
  const initials = displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const defaultRenderMessage: MessageListProps['renderMessage'] = profile ? (message) => <Message key={message.id} role={message.role} avatar={message.role === 'assistant' ? <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-background">{profile.avatar ? <img src={profile.avatar} alt={displayName} className="size-full object-cover" /> : initials}</div> : undefined}>{message.parts.map((part, index) => <MessagePart key={`${message.id}-${index}`} part={part} />)}</Message> : undefined

  return <ChatShell panel={panel} sidebar={<ThreadHistory threads={displayedThreads} activeThreadId={threadId} fallbackTitle={fallbackTitle} onThreadChange={selectThread} renderActions={renderThreadActions ? (thread) => renderThreadActions(thread, mutate(thread)) : undefined} />}>
    {headerSlot}
    {chat.messages.length === 0 && !history.loading ? emptyContent : <MessageList messages={chat.messages} renderMessage={renderMessage ?? defaultRenderMessage} />}
    <div className="p-4">
      <ChatStatus aborted={aborted} abortedContent={abortedContent} error={error} errorContent={errorContent} warningContent={warningContent} />
      <Composer sdk={sdk} filesSlug={filesSlug} pending={chat.status === 'submitted' || chat.status === 'streaming'} onStop={stop} onSubmit={submit} startSlot={composerStartSlot} endSlot={composerEndSlot} submitContent={submitContent} stopContent={stopContent} />
    </div>
  </ChatShell>
}
