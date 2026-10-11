import { describe, expect, it, vi } from 'vitest';

import { createRestChatAdapter } from '../../../../packages/ui/src/chat/rest/adapter';

describe('listChats', () => {
  it('uses the dynamic chat slug, descending activity sort, and pagination', async () => {
    const result = {
      docs: [],
      page: 2,
      totalDocs: 30,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: true,
    };

    const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(Response.json(result)));

    await expect(
      createRestChatAdapter({ fetch, chatsSlug: 'conversations' }).listChats({
        agent: 'support',
        page: 2,
        limit: 10,
      }),
    ).resolves.toEqual(result);

    const url = decodeURIComponent(String(fetch.mock.calls[0]?.[0]));

    expect(url).toContain('/api/conversations?');
    expect(url).toContain('sort=-lastMessageAt');
    expect(url).toContain('page=2');
    expect(url).toContain('limit=10');
    expect(url).toContain('where[agent][equals]=support');
  });
});
