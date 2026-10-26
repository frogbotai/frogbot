import { describe, expect, it, vi } from 'vitest';

import { createRestChatAdapter } from '../../../../packages/ui/src/chat/rest/adapter';

const slugs = { chatsSlug: 'conversations', messagesSlug: 'turns', assetsSlug: 'files' };

describe('chat mutations', () => {
  it('renames through the dynamic chat collection', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ id: 't1', title: 'New' })));

    await createRestChatAdapter({ fetch, ...slugs }).renameChat?.('c1', 'New');

    expect(fetch).toHaveBeenCalledWith(
      '/api/conversations/c1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ title: 'New' }) }),
    );
  });

  it('deletes a chat with one DELETE, leaving its messages to the server', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({})));

    await createRestChatAdapter({ fetch, ...slugs }).deleteChat?.('c1');

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      '/api/conversations/c1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
