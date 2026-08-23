import { createFrogbotSDK } from '@frogbotai/sdk';
import { describe, expect, it, vi } from 'vitest';

import { deleteChat, renameChat } from './mutations';

describe('chat mutations', () => {
  it('renames through the dynamic chat collection', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    const fetch = vi.fn(() => Promise.resolve(Response.json({ id: 't1', title: 'New' })));
    await renameChat(
      {
        sdk: createFrogbotSDK({ baseURL: '/api', fetch }),
        chatsSlug: 'conversations',
        chatId: 'c1',
      },
      'New',
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/conversations/c1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ title: 'New' }) }),
    );
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'frogbot:chats:mutated' }),
    );
    vi.unstubAllGlobals();
  });

  it('deletes messages before their chat', async () => {
    const urls: string[] = [];
    const fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      urls.push(url);
      return Promise.resolve(
        url.includes('?') ? Response.json({ docs: [{ id: 'm1' }, { id: 2 }] }) : Response.json({}),
      );
    });
    await deleteChat({
      sdk: createFrogbotSDK({ baseURL: '/api', fetch }),
      chatsSlug: 'conversations',
      messagesSlug: 'turns',
      chatId: 'c1',
    });
    expect(urls[0]).toContain('/api/turns?');
    expect(urls.slice(1, 3).sort()).toEqual(['/api/turns/2', '/api/turns/m1']);
    expect(urls[3]).toBe('/api/conversations/c1');
  });
});
