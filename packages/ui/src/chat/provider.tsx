'use client'

import { createFrogbotSDK, type FrogBotSDK } from '@frogbotai/sdk'
import type { ManifestResponse } from 'frogbot'
import { createContext, type ReactNode,use, useEffect, useMemo, useState } from 'react'

import type { ChatPlatformAdapter } from './adapter'
import { ArtifactProvider } from './artifact'
import type { ArtifactPersistence, ArtifactRegistryItem } from './artifact-registry'
import type { ToolRenderer } from './tool-registry'

export type ChatManifest = ManifestResponse

export type ChatProviderValue = {
  adapter: ChatPlatformAdapter
  sdk: FrogBotSDK
  manifest?: ChatManifest
  error?: Error
  loading: boolean
  toolRenderers: readonly ToolRenderer[]
}

const ChatContext = createContext<ChatProviderValue | undefined>(undefined)

export function ChatProvider({ adapter, artifactKinds = [], artifactPersistence, children, toolRenderers = [] }: { adapter: ChatPlatformAdapter; artifactKinds?: readonly ArtifactRegistryItem[]; artifactPersistence?: ArtifactPersistence; children: ReactNode; toolRenderers?: readonly ToolRenderer[] }) {
  const sdk = useMemo(() => createFrogbotSDK({
    baseURL: adapter.apiBase ?? '/api',
    fetch: async (input, init) => {
      const headers = new Headers(await (typeof adapter.headers === 'function' ? adapter.headers() : adapter.headers))
      new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
      return adapter.fetch(input, { ...init, headers })
    },
  }), [adapter])
  const [state, setState] = useState<Omit<ChatProviderValue, 'adapter' | 'sdk' | 'toolRenderers'>>({ loading: true })

  useEffect(() => {
    const controller = new AbortController()
    void sdk.request('/frogbot', { signal: controller.signal }).then((response) => response.json() as Promise<ChatManifest>).then((manifest) => setState({ manifest, loading: false })).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ error: error instanceof Error ? error : new Error(String(error)), loading: false })
    })
    return () => controller.abort()
  }, [sdk])

  return <ChatContext value={{ adapter, sdk, ...state, toolRenderers }}><ArtifactProvider persistence={artifactPersistence} registry={artifactKinds}>{children}</ArtifactProvider></ChatContext>
}

export function useChatProvider(): ChatProviderValue | undefined {
  return use(ChatContext)
}
