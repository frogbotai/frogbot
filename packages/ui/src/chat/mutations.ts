import type { ChatPlatformAdapter } from './adapter'
import type { MessageDocument } from './messages'
import { chatRequest, type PayloadPage } from './rest'
import type { ThreadDocument } from './use-threads'

type ThreadMutationOptions = {
  adapter: ChatPlatformAdapter
  threadsSlug: string
  threadId: string | number
  apiBase?: string
}

export function renameThread({ adapter, threadsSlug, threadId, apiBase = '/api' }: ThreadMutationOptions, title: string): Promise<ThreadDocument> {
  return chatRequest(adapter, `${apiBase}/${encodeURIComponent(threadsSlug)}/${encodeURIComponent(String(threadId))}`, { method: 'PATCH', body: JSON.stringify({ title }) })
}

export async function deleteThread({ adapter, threadsSlug, messagesSlug, threadId, apiBase = '/api' }: ThreadMutationOptions & { messagesSlug: string }): Promise<void> {
  const params = new URLSearchParams({ depth: '0', limit: '0', 'where[thread][equals]': String(threadId) })
  const messages = await chatRequest<PayloadPage<MessageDocument>>(adapter, `${apiBase}/${encodeURIComponent(messagesSlug)}?${params}`)
  await Promise.all(messages.docs.map((message) => chatRequest(adapter, `${apiBase}/${encodeURIComponent(messagesSlug)}/${encodeURIComponent(String(message.id))}`, { method: 'DELETE' })))
  await chatRequest(adapter, `${apiBase}/${encodeURIComponent(threadsSlug)}/${encodeURIComponent(String(threadId))}`, { method: 'DELETE' })
}
