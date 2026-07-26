'use client'

import { createContext, use, useEffect, useState, type ReactNode } from 'react'
import type { ChatPlatformAdapter } from './adapter'
import { resolveChatHeaders } from './rest'
import type { ToolRenderer } from './tool-registry'
import { ArtifactProvider } from './artifact'
import type { ArtifactPersistence, ArtifactRegistryItem } from './artifact-registry'

export type ChatManifest = {
  chat: { enabled: false } | { enabled: true; threadsSlug: string; messagesSlug: string }
  agents: { slug: string }[]
}

export type ChatProviderValue = {
  adapter: ChatPlatformAdapter
  manifest?: ChatManifest
  error?: Error
  loading: boolean
  toolRenderers: readonly ToolRenderer[]
}

const ChatContext = createContext<ChatProviderValue | undefined>(undefined)

export function ChatProvider({ adapter, artifactKinds = [], artifactPersistence, children, manifestURL = '/api/frogbot', toolRenderers = [] }: { adapter: ChatPlatformAdapter; artifactKinds?: readonly ArtifactRegistryItem[]; artifactPersistence?: ArtifactPersistence; children: ReactNode; manifestURL?: string; toolRenderers?: readonly ToolRenderer[] }) {
  const [state, setState] = useState<Omit<ChatProviderValue, 'adapter' | 'toolRenderers'>>({ loading: true })

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

  return <ChatContext value={{ adapter, ...state, toolRenderers }}><ArtifactProvider persistence={artifactPersistence} registry={artifactKinds}>{children}</ArtifactProvider></ChatContext>
}

export function useChatProvider(): ChatProviderValue | undefined {
  return use(ChatContext)
}
