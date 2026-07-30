'use client'

import { useCallback, useEffect, useState } from 'react'

import type { ChatPlatformAdapter } from './adapter'
import { chatRequest, type PayloadPage } from './rest'

export type ThreadDocument = {
  id: string | number
  title?: string | null
  agent: string
  lastMessageAt?: string | null
}

export type UseThreadsOptions = {
  adapter: ChatPlatformAdapter
  threadsSlug: string
  agent?: string
  apiBase?: string
  page?: number
  limit?: number
}

export async function loadThreads({ adapter, agent, threadsSlug, apiBase = '/api', page = 1, limit = 20 }: UseThreadsOptions): Promise<PayloadPage<ThreadDocument>> {
  const params = new URLSearchParams({ depth: '0', sort: '-lastMessageAt', page: String(page), limit: String(limit) })
  if (agent) params.set('where[agent][equals]', agent)
  return chatRequest(adapter, `${apiBase}/${encodeURIComponent(threadsSlug)}?${params}`)
}

export function useThreads(options: UseThreadsOptions) {
  const [result, setResult] = useState<PayloadPage<ThreadDocument>>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    let active = true
    setLoading(true)
    void loadThreads(options).then((next) => { if (active) { setResult(next); setError(undefined); setLoading(false) } }).catch((value: unknown) => { if (active) { setError(value instanceof Error ? value : new Error(String(value))); setLoading(false) } })
    return () => { active = false }
  }, [options.adapter, options.agent, options.apiBase, options.limit, options.page, options.threadsSlug])

  useEffect(() => refresh(), [refresh])

  return { ...result, error, loading, refresh: () => { refresh() } }
}
