import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  chat: vi.fn(({ composerStartSlot }: { composerStartSlot?: ReactNode }) => composerStartSlot),
  provider: vi.fn(),
}));

vi.mock('@payloadcms/ui', () => ({
  usePreferences: () => ({
    getPreference: () => Promise.resolve(null),
    setPreference: vi.fn(),
  }),
  useTheme: () => ({ theme: 'dark' }),
}));

vi.mock('@frogbotai/ui/chat', () => ({
  AgentSelector: ({ onAgentChange }: { onAgentChange: (agent: string) => void }) => (
    <button onClick={() => onAgentChange('sales')}>Sales</button>
  ),
  Chat: mocks.chat,
  ChatProvider: (props: { children: ReactNode; toolRenderers?: unknown }) => {
    mocks.provider(props);
    return props.children;
  },
  cookieFetch: () => vi.fn(),
  ModelSelector: () => null,
  useChatProvider: () => ({
    agentManifest: {
      defaultAgent: 'general',
      agents: [
        {
          slug: 'general',
          label: 'General',
          source: 'config',
          defaultModel: 'openai/test',
          models: ['openai/test'],
        },
        {
          slug: 'sales',
          label: 'Sales',
          source: 'config',
          defaultModel: 'openai/test',
          models: ['openai/test'],
        },
      ],
    },
    loading: false,
  }),
}));

const { ChatViewClient } = await import('../../../../packages/next/src/exports/ChatView.client.js');

describe('ChatViewClient', () => {
  it('replaces the create route once without changing the mounted chat', async () => {
    vi.stubGlobal('matchMedia', () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const general = [{ kind: 'lookup', render: () => null }];
    const sales = [{ kind: 'lookup', render: () => null }];
    render(
      <ChatViewClient
        agent="general"
        documentPath="/admin/collections/conversations"
        initialMessages={[]}
        toolRenderersByAgent={{ general, sales }}
      />,
    );
    await waitFor(() => expect(mocks.chat).toHaveBeenCalledOnce());
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
    expect(mocks.provider.mock.calls.at(-1)?.[0].toolRenderers).toBe(general);
    fireEvent.click(await screen.findByText('Sales'));
    await waitFor(() => expect(mocks.provider.mock.calls.at(-1)?.[0].toolRenderers).toBe(sales));
  });
});
