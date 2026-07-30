import { describe, expect, it, vi } from 'vitest'

import { deleteThread, renameThread } from './mutations'

describe('thread mutations', () => {
  it('renames through the dynamic thread collection', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ id: 't1', title: 'New' })))
    await renameThread({ adapter: { fetch }, threadsSlug: 'conversations', threadId: 't1' }, 'New')
    expect(fetch).toHaveBeenCalledWith('/api/conversations/t1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ title: 'New' }) }))
  })

  it('deletes messages before their thread', async () => {
    const urls: string[] = []
    const fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      urls.push(url)
      return Promise.resolve(url.includes('?') ? Response.json({ docs: [{ id: 'm1' }, { id: 2 }] }) : Response.json({}))
    })
    await deleteThread({ adapter: { fetch }, threadsSlug: 'conversations', messagesSlug: 'turns', threadId: 't1' })
    expect(urls[0]).toContain('/api/turns?')
    expect(urls.slice(1, 3).sort()).toEqual(['/api/turns/2', '/api/turns/m1'])
    expect(urls[3]).toBe('/api/conversations/t1')
  })
})
