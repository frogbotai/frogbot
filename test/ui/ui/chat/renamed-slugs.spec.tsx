import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Chat } from '../../../../packages/ui/src/chat/chat';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    status: 'ready',
    setMessages: vi.fn(),
    sendMessage: vi.fn(),
    stop: vi.fn(),
  }),
}));

describe('renamed collection acceptance', () => {
  it('drives Chat through the manifest and renamed collection endpoints', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://frogbot.example/api/frogbot') {
        return Response.json({
          chat: { enabled: true, chatsSlug: 'conversations', messagesSlug: 'turns' },
          files: { slug: 'assets' },
          agents: [{ slug: 'support' }],
        });
      }
      if (url === 'https://frogbot.example/api/agents') {
        return Response.json({
          defaultAgent: 'support',
          agents: [
            {
              slug: 'support',
              label: 'Support',
              source: 'config',
              defaultModel: 'openai/test',
              models: ['openai/test'],
            },
          ],
        });
      }
      if (url.startsWith('https://frogbot.example/api/conversations?')) {
        return Response.json({
          docs: [{ id: 'chat-1', agent: 'support', title: 'Renamed chat' }],
          page: 1,
          totalDocs: 1,
          totalPages: 1,
        });
      }
      if (url.startsWith('https://frogbot.example/api/turns?')) {
        return Response.json({
          docs: [
            {
              id: 'message-1',
              chat: 'chat-1',
              role: 'user',
              parts: [{ type: 'text', text: 'Loaded through renamed endpoint' }],
            },
          ],
          page: 1,
          totalDocs: 1,
          totalPages: 1,
        });
      }
      return new Response(null, { status: 404 });
    });

    render(
      <ChatProvider
        adapter={{
          apiBase: 'https://frogbot.example/api',
          fetch,
          headers: { Authorization: 'Bearer runtime' },
        }}
      >
        <Chat agent="support" defaultChatId="chat-1" />
      </ChatProvider>,
    );

    await screen.findByText('Renamed chat');
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([url]) => {
          const value = decodeURIComponent(String(url));
          return (
            value.startsWith('https://frogbot.example/api/conversations?') &&
            value.includes('where[agent][equals]=support')
          );
        }),
      ).toBe(true),
    );
    expect(
      fetch.mock.calls.some(([url]) =>
        String(url).startsWith('https://frogbot.example/api/turns?'),
      ),
    ).toBe(true);
    expect(
      fetch.mock.calls.every(
        ([, init]) => new Headers(init?.headers).get('Authorization') === 'Bearer runtime',
      ),
    ).toBe(true);
  });
});
