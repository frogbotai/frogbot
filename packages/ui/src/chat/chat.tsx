'use client'

import { useChat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useControlledState } from '../hooks/use-controlled-state'
import { ChatShell } from './chat-shell'
import { ChatStatus } from './chat-status'
import { Composer } from './composer'
import { deleteThread, renameThread } from './mutations'
import { useChatProvider } from './provider'
import { MessageList } from './message-list'
import { deriveThreadTitle, ThreadHistory } from './thread-history'
import { FrogbotChatTransport, prepareChatRequest } from './transport'
import type { ThreadDocument } from './use-threads'
import { useThread } from './use-thread'
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
  apiBase?: string
  throttle?: number
  emptyContent?: ReactNode
  loadingContent?: ReactNode
  composerStartSlot?: ReactNode
  composerEndSlot?: ReactNode
  submitContent?: ReactNode
  stopContent?: ReactNode
  fallbackTitle?: string
  errorContent?: (error: Error) => ReactNode
  abortedContent?: ReactNode
  warningContent?: ReactNode
  renderThreadActions?: (thread: ThreadDocument, actions: ThreadActions) => ReactNode
  panel?: ReactNode
}

export function Chat(props: ChatProps) {
  const provider = useChatProvider()
  if (!provider) throw new Error('Chat requires ChatProvider')
  if (provider.loading) return props.loadingContent
  if (provider.error) return props.errorContent?.(provider.error)
  if (!provider.manifest || !provider.manifest.chat.enabled) return props.emptyContent
  return <ChatOrchestrator {...props} threadIdControlled={Object.prototype.hasOwnProperty.call(props, 'threadId')} adapter={provider.adapter} messagesSlug={provider.manifest.chat.messagesSlug} threadsSlug={provider.manifest.chat.threadsSlug} />
}

type ChatOrchestratorProps = ChatProps & {
  adapter: NonNullable<ReturnType<typeof useChatProvider>>['adapter']
  messagesSlug: string
  threadsSlug: string
  threadIdControlled: boolean
}

function ChatOrchestrator({ abortedContent, adapter, agent, apiBase = '/api', composerEndSlot, composerStartSlot, defaultThreadId, emptyContent, errorContent, fallbackTitle = 'New chat', messagesSlug, onThreadIdChange, panel, renderThreadActions, stopContent = 'Stop', submitContent = 'Send', threadId: controlledThreadId, threadIdControlled, threadsSlug, throttle, warningContent }: ChatOrchestratorProps) {
  const [threadId, setThreadId] = useControlledState<string | number | undefined>({ controlled: threadIdControlled, defaultValue: defaultThreadId, onChange: onThreadIdChange, value: controlledThreadId })
  const [chatId, setChatId] = useState(threadId === undefined ? `new:${agent}` : String(threadId))
  const createdThreadId = useRef<string | undefined>(undefined)
  const reportedThreadId = useRef<string | undefined>(undefined)
  const previousAgent = useRef(agent)
  const history = useThread({ adapter, apiBase, messagesSlug, threadId })
  const threads = useThreads({ adapter, agent, apiBase, threadsSlug })
  const [aborted, setAborted] = useState(false)
  const transport = useMemo(() => new FrogbotChatTransport({
    agentSlug: agent,
    apiBase,
    fetch: adapter.fetch,
    headers: adapter.headers ? async () => Object.fromEntries(new Headers(await (typeof adapter.headers === 'function' ? adapter.headers() : adapter.headers)).entries()) : undefined,
    onThreadId: (nextThreadId) => { createdThreadId.current = nextThreadId },
    prepareSendMessagesRequest: prepareChatRequest(threadId),
  }), [adapter, agent, apiBase, threadId])
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
      await renameThread({ adapter, apiBase, threadsSlug, threadId: thread.id }, title)
      threads.refresh()
    },
    delete: async () => {
      await deleteThread({ adapter, apiBase, messagesSlug, threadsSlug, threadId: thread.id })
      if (String(threadId) === String(thread.id)) {
        clearConversation()
        setThreadId(undefined)
      }
      threads.refresh()
    },
  })
  const submit = async (text: string) => {
    setAborted(false)
    const message: UIMessage = { id: '', role: 'user', parts: [{ type: 'text', text }] }
    const metadata = await adapter.buildMetadata?.(message)
    await chat.sendMessage({ text, metadata })
  }
  const stop = () => {
    setAborted(true)
    void chat.stop()
  }
  const error = history.error ?? threads.error ?? chat.error
  const displayedThreads = (threads.docs ?? []).map((thread) => String(thread.id) === String(threadId) && !thread.title ? { ...thread, title: deriveThreadTitle(chat.messages, fallbackTitle) } : thread)

  return <ChatShell panel={panel} sidebar={<ThreadHistory threads={displayedThreads} activeThreadId={threadId} fallbackTitle={fallbackTitle} onThreadChange={selectThread} renderActions={renderThreadActions ? (thread) => renderThreadActions(thread, mutate(thread)) : undefined} />}>
    {chat.messages.length === 0 && !history.loading ? emptyContent : <MessageList messages={chat.messages} />}
    <div className="p-4">
      <ChatStatus aborted={aborted} abortedContent={abortedContent} error={error} errorContent={errorContent} warningContent={warningContent} />
      <Composer pending={chat.status === 'submitted' || chat.status === 'streaming'} onStop={stop} onSubmit={submit} startSlot={composerStartSlot} endSlot={composerEndSlot} submitContent={submitContent} stopContent={stopContent} />
    </div>
  </ChatShell>
}
