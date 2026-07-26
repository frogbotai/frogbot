import { describe, expect, it, vi } from 'vitest'
import { bearerFetch, cookieFetch } from './auth'

describe('chat auth fetches', () => {
  it('uses cookie credentials without changing global fetch', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response()))
    await cookieFetch(fetch)('/api/test')
    expect(fetch).toHaveBeenCalledWith('/api/test', { credentials: 'include' })
  })

  it('injects a current bearer token', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response()))
    await bearerFetch(() => Promise.resolve('token'), fetch)('/api/test', { headers: { Accept: 'application/json' } })
    const headers = fetch.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer token')
    expect(headers.get('Accept')).toBe('application/json')
  })
})
