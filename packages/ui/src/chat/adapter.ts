import type { UIMessage } from 'ai'

export type ChatPlatformAdapter = {
  fetch: typeof globalThis.fetch
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
  buildMetadata?: (message: UIMessage) => Record<string, unknown> | Promise<Record<string, unknown>>
  executeClientTool?: (name: string, input: unknown) => unknown
  openURL?: (url: string) => void | Promise<void>
  navigate?: (path: string) => void | Promise<void>
  shouldNotify?: (message: UIMessage) => boolean
}
