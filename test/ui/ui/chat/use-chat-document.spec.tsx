import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatDocument } from '../../../../packages/ui/src/chat/adapter';
import { createRestChatAdapter } from '../../../../packages/ui/src/chat/rest/adapter';
import { CHAT_MUTATION_EVENT, useChatDocument } from '../../../../packages/ui/src/chat/use-chats';

const request = vi.fn<typeof globalThis.fetch>();
const adapter = createRestChatAdapter({ fetch: request, chatsSlug: 'chats' });
const initialChat: ChatDocument = { id: 'chat-1', agent: 'general', title: 'Hello' };

function renderChatDocument(revalidate?: boolean) {
  return renderHook(() =>
    useChatDocument({
      adapter,
      chatId: 'chat-1',
      initialData: initialChat,
      revalidate,
    }),
  );
}

describe('useChatDocument', () => {
  beforeEach(() => {
    request
      .mockReset()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ ...initialChat, title: 'Generated title' })),
      );
  });

  it('re-fetches the chat when a chat mutation is announced with revalidate', async () => {
    const { result } = renderChatDocument(true);

    act(() => {
      window.dispatchEvent(new Event(CHAT_MUTATION_EVENT));
    });

    await waitFor(() => expect(result.current.chat?.title).toBe('Generated title'));

    expect(request).toHaveBeenCalledExactlyOnceWith('/api/chats/chat-1?depth=0', expect.anything());
  });

  it('re-fetches the chat when the window regains focus with revalidate', async () => {
    const { result } = renderChatDocument(true);

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(result.current.chat?.title).toBe('Generated title'));

    expect(request).toHaveBeenCalledOnce();
  });

  it('keeps the loaded chat on mutations and focus without revalidate', async () => {
    const { result } = renderChatDocument();

    act(() => {
      window.dispatchEvent(new Event(CHAT_MUTATION_EVENT));
      window.dispatchEvent(new Event('focus'));
    });

    await act(async () => {});

    expect(request).not.toHaveBeenCalled();
    expect(result.current.chat?.title).toBe('Hello');
  });

  it('stops re-fetching after unmount', () => {
    const { unmount } = renderChatDocument(true);

    unmount();

    window.dispatchEvent(new Event(CHAT_MUTATION_EVENT));
    window.dispatchEvent(new Event('focus'));

    expect(request).not.toHaveBeenCalled();
  });
});
