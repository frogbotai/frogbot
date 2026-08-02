import type { FrogBotSDK } from '@frogbotai/sdk'
import type { MessageDocument } from './messages'
import { chatRequest, type PayloadPage } from './rest'
import type { ThreadDocument } from './use-threads'

type ThreadMutationOptions = {
  sdk: FrogBotSDK
  threadsSlug: string
  threadId: string | number
}

export function renameThread({ sdk, threadsSlug, threadId }: ThreadMutationOptions, title: string): Promise<ThreadDocument> {
  return chatRequest(sdk, `/${encodeURIComponent(threadsSlug)}/${encodeURIComponent(String(threadId))}`, { method: 'PATCH', body: JSON.stringify({ title }), headers: { 'Content-Type': 'application/json' } })
}

export async function deleteThread({ sdk, threadsSlug, messagesSlug, threadId }: ThreadMutationOptions & { messagesSlug: string }): Promise<void> {
  const params = new URLSearchParams({ depth: '0', limit: '0', 'where[thread][equals]': String(threadId) })
  const messages = await chatRequest<PayloadPage<MessageDocument>>(sdk, `/${encodeURIComponent(messagesSlug)}?${params}`)
  await Promise.all(messages.docs.map((message) => chatRequest(sdk, `/${encodeURIComponent(messagesSlug)}/${encodeURIComponent(String(message.id))}`, { method: 'DELETE' })))
  await chatRequest(sdk, `/${encodeURIComponent(threadsSlug)}/${encodeURIComponent(String(threadId))}`, { method: 'DELETE' })
}
