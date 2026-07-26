import { describe, expect, it, vi } from 'vitest'
import { loadThreads } from './use-threads'

describe('loadThreads', () => {
  it('uses the dynamic thread slug, descending activity sort, and pagination', async () => {
    const result = { docs: [], page: 2, totalDocs: 30, totalPages: 3, hasNextPage: true, hasPrevPage: true }
    const fetch = vi.fn(() => Promise.resolve(Response.json(result)))
    await expect(loadThreads({ adapter: { fetch }, threadsSlug: 'conversations', page: 2, limit: 10 })).resolves.toEqual(result)
    const url = decodeURIComponent(String(fetch.mock.calls[0]?.[0]))
    expect(url).toContain('/api/conversations?')
    expect(url).toContain('sort=-lastMessageAt')
    expect(url).toContain('page=2')
    expect(url).toContain('limit=10')
  })
})
