import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const push = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@payloadcms/ui', () => ({ useTheme: () => ({ theme: 'dark' }) }));

import { ChatList } from './ChatListView.client.js';

describe('ChatList', () => {
  it('navigates chat entries to their collection document route', () => {
    vi.stubGlobal('matchMedia', () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
    render(
      <ChatList
        chats={[{ id: 'chat/1', agent: 'general', title: 'First chat' }]}
        collectionSlug="team chats"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'First chat' }));

    expect(push).toHaveBeenCalledWith('/admin/collections/team%20chats/chat%2F1');
  });
});
