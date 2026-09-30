import type { FrogBotSDK } from '@frogbotai/sdk';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHAT_MUTATION_EVENT,
  type ChatDocument,
  useChatDocument,
} from '../../../../packages/ui/src/chat/use-chats';

const request = vi.fn();
const sdk = { request } as unknown as FrogBotSDK;
const initialChat: ChatDocument = { id: 'chat-1', agent: 'general', title: 'Hello' };

function renderChatDocument(revalidate?: boolean) {
  return renderHook(() =>
    useChatDocument({
      sdk,
      chatsSlug: 'chats',
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
      .mockImplementation(async () => Response.json({ ...initialChat, title: 'Generated title' }));
  });

  it('re-fetches the chat when a chat mutation is announced with revalidate', async () => {
    const { result } = renderChatDocument(true);

    act(() => {
      window.dispatchEvent(new Event(CHAT_MUTATION_EVENT));
    });

    await waitFor(() => expect(result.current.chat?.title).toBe('Generated title'));

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('/chats/chat-1?depth=0', undefined);
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
