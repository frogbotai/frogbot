export function cookieFetch(fetch: typeof globalThis.fetch = globalThis.fetch): typeof globalThis.fetch {
  return (input, init) => fetch(input, { ...init, credentials: init?.credentials ?? 'include' })
}

export function bearerFetch(getToken: () => string | undefined | Promise<string | undefined>, fetch: typeof globalThis.fetch = globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers)
    const token = await getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, headers })
  }
}
