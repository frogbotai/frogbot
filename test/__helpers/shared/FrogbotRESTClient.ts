// Thin fetch wrapper bound to a running frogbot Hono server. Returns
// parsed JSON plus status for ergonomic assertions. Modeled on
// Payload's NextRESTClient.

export type RESTResponse<T = unknown> = {
  status: number
  body: T
  headers: Headers
}

export class FrogbotRESTClient {
  constructor(private readonly baseUrl: string) {}

  async get<T = unknown>(path: string, init?: RequestInit): Promise<RESTResponse<T>> {
    return this.request<T>('GET', path, undefined, init)
  }

  async post<T = unknown>(
    path: string,
    body?: unknown,
    init?: RequestInit,
  ): Promise<RESTResponse<T>> {
    return this.request<T>('POST', path, body, init)
  }

  async patch<T = unknown>(
    path: string,
    body?: unknown,
    init?: RequestInit,
  ): Promise<RESTResponse<T>> {
    return this.request<T>('PATCH', path, body, init)
  }

  async delete<T = unknown>(path: string, init?: RequestInit): Promise<RESTResponse<T>> {
    return this.request<T>('DELETE', path, undefined, init)
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    init?: RequestInit,
  ): Promise<RESTResponse<T>> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`
    const headers = new Headers(init?.headers)
    if (body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }
    const res = await fetch(url, {
      ...init,
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let parsed: unknown
    try {
      parsed = text.length > 0 ? JSON.parse(text) : undefined
    } catch {
      parsed = text
    }
    return { status: res.status, body: parsed as T, headers: res.headers }
  }
}
