import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChatShell } from '../../../../packages/ui/src/chat/chat-shell';
import { ChatStatus } from '../../../../packages/ui/src/chat/chat-status';
import { ChatHistory, deriveChatTitle } from '../../../../packages/ui/src/chat/chat-history';

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
