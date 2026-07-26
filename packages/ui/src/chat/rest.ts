import type { ChatPlatformAdapter } from './adapter'

export type PayloadPage<T> = {
  docs: T[]
  page: number
  totalDocs: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export function resolveChatHeaders(adapter: ChatPlatformAdapter): HeadersInit | Promise<HeadersInit> | undefined {
  return typeof adapter.headers === 'function' ? adapter.headers() : adapter.headers
}

export async function chatRequest<T>(adapter: ChatPlatformAdapter, url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(await resolveChatHeaders(adapter))
  if (init?.body) headers.set('Content-Type', 'application/json')
  const response = await adapter.fetch(url, { ...init, headers })
  if (!response.ok) throw new Error(await response.text() || `Request failed with ${response.status}`)
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}
