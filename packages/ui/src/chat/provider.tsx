'use client'

import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import type { ChatPlatformAdapter } from './adapter'
import { resolveChatHeaders } from './rest'

export type ChatManifest = {
  chat: { enabled: false } | { enabled: true; threadsSlug: string; messagesSlug: string }
  agents: { slug: string }[]
}

export type ChatProviderValue = {
  adapter: ChatPlatformAdapter
  manifest?: ChatManifest
  error?: Error
  loading: boolean
}

const ChatContext = createContext<ChatProviderValue | undefined>(undefined)

export function ChatProvider({ adapter, children, manifestURL = '/api/frogbot' }: { adapter: ChatPlatformAdapter; children: ReactNode; manifestURL?: string }) {
  const [state, setState] = useState<Omit<ChatProviderValue, 'adapter'>>({ loading: true })

  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve(resolveChatHeaders(adapter)).then((headers) => adapter.fetch(manifestURL, { headers, signal: controller.signal })).then(async (response) => {
      if (!response.ok) throw new Error(await response.text() || `Manifest request failed with ${response.status}`)
      return response.json() as Promise<ChatManifest>
    }).then((manifest) => setState({ manifest, loading: false })).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ error: error instanceof Error ? error : new Error(String(error)), loading: false })
    })
    return () => controller.abort()
  }, [adapter, manifestURL])

  return <ChatContext value={{ adapter, ...state }}>{children}</ChatContext>
}

export function useChatProvider(): ChatProviderValue | undefined {
  return use(ChatContext)
}
