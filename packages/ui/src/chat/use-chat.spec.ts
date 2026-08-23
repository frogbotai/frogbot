import { createFrogbotSDK } from '@frogbotai/sdk';
import { describe, expect, it, vi } from 'vitest';

import { loadChat } from './use-chat';

describe('loadChat', () => {
  it('uses the manifest message slug and returns mapped messages in creation order', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        Response.json({ docs: [{ id: 7, role: 'user', parts: [{ type: 'text', text: 'hi' }] }] }),
      ),
    );
    await expect(
      loadChat({
        sdk: createFrogbotSDK({ baseURL: '/api', fetch }),
        messagesSlug: 'turns',
        chatId: 'chat-1',
      }),
    ).resolves.toEqual([{ id: '7', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
    expect(fetch.mock.calls[0]?.[0]).toContain('/api/turns?');
    expect(decodeURIComponent(String(fetch.mock.calls[0]?.[0]))).toContain(
      'where[chat][equals]=chat-1',
    );
  });
});
