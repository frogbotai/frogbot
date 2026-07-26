'use client'

import { useEffect, useState } from 'react'
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
  apiBase?: string
  page?: number
  limit?: number
}

export async function loadThreads({ adapter, threadsSlug, apiBase = '/api', page = 1, limit = 20 }: UseThreadsOptions): Promise<PayloadPage<ThreadDocument>> {
  const params = new URLSearchParams({ depth: '0', sort: '-lastMessageAt', page: String(page), limit: String(limit) })
  return chatRequest(adapter, `${apiBase}/${encodeURIComponent(threadsSlug)}?${params}`)
}

export function useThreads(options: UseThreadsOptions) {
  const [result, setResult] = useState<PayloadPage<ThreadDocument>>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    void loadThreads(options).then((next) => { if (active) { setResult(next); setError(undefined); setLoading(false) } }).catch((value: unknown) => { if (active) { setError(value instanceof Error ? value : new Error(String(value))); setLoading(false) } })
    return () => { active = false }
  }, [options.adapter, options.apiBase, options.limit, options.page, options.threadsSlug])

  return { ...result, error, loading }
}
