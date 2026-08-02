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
      let data: { errors?: FrogBotErrorDetail[]; message?: string } = {}
      try {
        data = await response.clone().json()
      } catch {}
      const errors = data.errors ?? [{ message: data.message ?? response.statusText }]
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
    return response.json() as Promise<FrogBotUpload>
  }
}

export function createFrogbotSDK(config: FrogBotSDKConfig): FrogBotSDK {
  return new FrogBotSDK(config)
}

export default FrogBotSDK
