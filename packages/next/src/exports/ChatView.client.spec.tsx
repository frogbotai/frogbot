import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ chat: vi.fn(() => null) }));

vi.mock('@frogbotai/ui/chat', () => ({
  Chat: mocks.chat,
  ChatProvider: ({ children }: { children: ReactNode }) => children,
  cookieFetch: () => vi.fn(),
}));

const { ChatViewClient } = await import('./ChatView.client.js');

describe('ChatViewClient', () => {
  it('replaces the create route once without changing the mounted chat', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    render(
      <ChatViewClient
        agent="general"
        documentPath="/admin/collections/conversations"
        initialMessages={[]}
      />,
    );
    const props = mocks.chat.mock.calls[0][0];

    expect(props).not.toHaveProperty('chatId');
    props.onChatIdChange('chat/1');
    props.onChatIdChange('chat-2');

    expect(replaceState).toHaveBeenCalledOnce();
    expect(replaceState).toHaveBeenCalledWith(
      window.history.state,
      '',
      '/admin/collections/conversations/chat%2F1',
    );
    expect(mocks.chat).toHaveBeenCalledOnce();
  });
});
