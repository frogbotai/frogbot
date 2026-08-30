import type { FrogBotSDK } from '@frogbotai/sdk';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChatHistory, deriveChatTitle } from '../../../../packages/ui/src/chat/chat-history';
import { ChatShell } from '../../../../packages/ui/src/chat/chat-shell';
import { ChatStatus } from '../../../../packages/ui/src/chat/chat-status';

describe('provider-free chat shell', () => {
  it('selects history and exposes active state', () => {
    const onChatChange = vi.fn();
    render(
      <ChatHistory
        chats={[
          { id: 1, agent: 'a', title: 'First' },
          { id: 2, agent: 'a' },
        ]}
        activeChatId={1}
        fallbackTitle="Untitled"
        onChatChange={onChatChange}
        renderActions={() => <button>Actions</button>}
      />,
    );
    expect(screen.getByText('First').getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByText('Untitled'));
    expect(onChatChange).toHaveBeenCalledWith(2);
  });

  it('derives the full first user message and supports an explicit limit', () => {
    const messages = [
      { id: '1', role: 'assistant' as const, parts: [{ type: 'text' as const, text: 'Ignore' }] },
      {
        id: '2',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'A title that is too long' }],
      },
    ];
    expect(deriveChatTitle(messages, 'Fallback')).toBe('A title that is too long');
    expect(deriveChatTitle(messages, 'Fallback', 12)).toBe('A title tha…');
    expect(deriveChatTitle([], 'Fallback')).toBe('Fallback');
  });

  it('deletes an active chat through confirmation and enters the new-chat state', async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            docs: [{ id: 'message-1' }],
            page: 1,
            totalDocs: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false,
          }),
        ),
      )
      .mockResolvedValue(new Response(null, { status: 204 }));
    render(
      <ChatHistory
        activeChatId="chat-1"
        chats={[{ id: 'chat-1', agent: 'a', title: 'First' }]}
        chatsSlug="chats"
        fallbackTitle="Untitled"
        messagesSlug="messages"
        onChatChange={vi.fn()}
        onNewChat={onNewChat}
        sdk={{ request } as unknown as FrogBotSDK}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Chat actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await vi.waitFor(() => expect(onNewChat).toHaveBeenCalledOnce());
    expect(request).toHaveBeenLastCalledWith('/chats/chat-1', { method: 'DELETE' });
  });

  it('renders shell and injected status content without a provider', () => {
    render(
      <ChatShell sidebar="History" panel="Panel">
        <ChatStatus
          error={new Error('failure')}
          errorContent={(error) => <span>{error.message}</span>}
          warningContent="Warning"
        />
      </ChatShell>,
    );
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Panel')).toBeTruthy();
    expect(screen.getByText('failure')).toBeTruthy();
    expect(screen.getByText('Warning')).toBeTruthy();
  });
});
