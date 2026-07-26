import { DefaultChatTransport, type HttpChatTransportInitOptions, type UIMessage } from 'ai'

export type FrogbotChatTransportOptions<UI_MESSAGE extends UIMessage> = Omit<
  HttpChatTransportInitOptions<UI_MESSAGE>,
  'api' | 'fetch'
> & {
  agentSlug: string
  apiBase?: string
  fetch?: typeof globalThis.fetch
  onThreadId?: (threadId: string) => void
}

export class FrogbotChatTransport<UI_MESSAGE extends UIMessage = UIMessage> extends DefaultChatTransport<UI_MESSAGE> {
  threadId?: string

  constructor({ agentSlug, apiBase = '/api', fetch = globalThis.fetch, onThreadId, ...options }: FrogbotChatTransportOptions<UI_MESSAGE>) {
    const capture = { threadId: (_threadId: string) => undefined }
    super({
      ...options,
      api: `${apiBase}/agents/${encodeURIComponent(agentSlug)}`,
      fetch: async (input, init) => {
        const response = await fetch(input, init)
        const threadId = response.headers.get('X-Frogbot-Thread-Id')
        if (threadId) capture.threadId(threadId)
        if (response.status === 499) return new Response(new ReadableStream({ start: (controller) => controller.close() }), { status: 200 })
        return response
      },
    })
    capture.threadId = (threadId) => {
      this.threadId = threadId
      onThreadId?.(threadId)
    }
  }

  override reconnectToStream(): Promise<null> {
    return Promise.resolve(null)
  }
}
