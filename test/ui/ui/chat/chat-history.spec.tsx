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

  it('derives and truncates a title from the first user message', () => {
    expect(
      deriveChatTitle(
        [
          { id: '1', role: 'assistant', parts: [{ type: 'text', text: 'Ignore' }] },
          { id: '2', role: 'user', parts: [{ type: 'text', text: 'A title that is too long' }] },
        ],
        'Fallback',
        12,
      ),
    ).toBe('A title tha…');
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
