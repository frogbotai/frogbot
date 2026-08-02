export type FrogBotSDKConfig = {
  baseURL: string
  fetch?: typeof fetch
  headers?: HeadersInit
}

export type FrogBotRequestInit = Omit<RequestInit, 'body'> & {
  body?: BodyInit | null
  json?: unknown
}

export type FrogBotUpload = {
  id: string | number
  filename: string
  mimeType: string
}

export type FrogBotUploadResponse = {
  doc: FrogBotUpload
  message: string
}

export type AIChatRequest = {
  model: string
  messages: Array<{ role: string; content?: unknown; [key: string]: unknown }>
  stream?: boolean | null
  [key: string]: unknown
}

export type AITranscriptionRequest = {
  model: string
  file: File
  response_format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt' | null
  language?: string | null
  prompt?: string | null
  temperature?: number | null
  timestamp_granularities?: 'word' | 'segment' | Array<'word' | 'segment'> | null
}

export type AITranscriptionResult = {
  text: string
  [key: string]: unknown
}

export type FrogBotErrorDetail = {
  message: string
  [key: string]: unknown
}

export class FrogBotSDKError extends Error {
  errors: FrogBotErrorDetail[]
  response: Response
  status: number

  constructor({
    errors,
    message,
    response,
  }: {
    errors: FrogBotErrorDetail[]
    message: string
    response: Response
  }) {
    super(message)
    this.name = 'FrogBotSDKError'
    this.errors = errors
    this.response = response
    this.status = response.status
  }
}

export class FrogBotSDK {
  readonly baseURL: string
  readonly fetch: typeof fetch
  readonly headers: Headers
  readonly ai = {
    chat: (body: AIChatRequest, init: FrogBotRequestInit = {}) => this.request('/ai/v1/chat/completions', {
      ...init,
      method: 'POST',
      json: body,
    }),
    transcribe: async (input: AITranscriptionRequest): Promise<AITranscriptionResult> => {
      const body = new FormData()
      body.append('model', input.model)
      body.append('file', input.file)
      if (input.response_format != null) body.append('response_format', input.response_format)
      if (input.language != null) body.append('language', input.language)
      if (input.prompt != null) body.append('prompt', input.prompt)
      if (input.temperature != null) body.append('temperature', String(input.temperature))
      const granularities = Array.isArray(input.timestamp_granularities)
        ? input.timestamp_granularities
        : input.timestamp_granularities == null ? [] : [input.timestamp_granularities]
      for (const granularity of granularities) body.append('timestamp_granularities[]', granularity)
      const response = await this.request('/ai/v1/audio/transcriptions', { method: 'POST', body })
      return response.json() as Promise<AITranscriptionResult>
    },
  }

  constructor({ baseURL, fetch: customFetch, headers }: FrogBotSDKConfig) {
    this.baseURL = baseURL.replace(/\/$/, '')
    this.fetch = customFetch ?? globalThis.fetch.bind(globalThis)
    this.headers = new Headers(headers)
  }

  async request(path: string, incomingInit: FrogBotRequestInit = {}): Promise<Response> {
    const { json, ...requestInit } = incomingInit
    const headers = new Headers(this.headers)
    new Headers(incomingInit.headers).forEach((value, key) => headers.set(key, value))
    const init: RequestInit = { ...requestInit, headers }

    if (json !== undefined) {
      headers.set('Content-Type', 'application/json')
      init.body = JSON.stringify(json)
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    const response = await this.fetch(`${this.baseURL}${normalizedPath}`, init)

    if (!response.ok) {
      let data: { error?: { message?: string }; errors?: FrogBotErrorDetail[]; message?: string } = {}
      try {
        data = await response.clone().json()
      } catch {
        data = {}
      }
      const errors = data.errors ?? [{ message: data.error?.message ?? data.message ?? response.statusText }]
      throw new FrogBotSDKError({
        errors,
        message: errors[0]?.message ?? response.statusText,
        response,
      })
    }

    return response
  }

  async upload(collection: string, file: File): Promise<FrogBotUpload> {
    const body = new FormData()
    body.append('file', file)
    body.append('_payload', '{}')
    const response = await this.request(`/${collection}`, { method: 'POST', body })
    const result = await response.json() as FrogBotUploadResponse
    return result.doc
  }
}

export function createFrogbotSDK(config: FrogBotSDKConfig): FrogBotSDK {
  return new FrogBotSDK(config)
}

export default FrogBotSDK
