import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentSelector } from '../../../../packages/ui/src/chat/agent-selector';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';

const manifest = {
  ai: { transcribe: false as const },
  chat: { enabled: true, chatsSlug: 'chats', messagesSlug: 'messages' },
  files: { slug: 'files' },
  agents: [{ slug: 'support', profile: { name: 'Ada', avatar: '/ada.png' } }, { slug: 'sales' }],
};
const agentManifest = {
  defaultAgent: 'support',
  agents: [
    {
      slug: 'support',
      label: 'Ada',
      source: 'config' as const,
      defaultModel: 'openai/test',
      models: ['openai/test'],
    },
    {
      slug: 'sales',
      label: 'sales',
      source: 'config' as const,
      defaultModel: 'openai/test',
      models: ['openai/test'],
    },
  ],
};

const fetchManifest = vi.fn((input: RequestInfo | URL) =>
  Promise.resolve(Response.json(String(input).endsWith('/agents') ? agentManifest : manifest)),
);

describe('AgentSelector', () => {
  it('selects manifest agents and marks the current agent', async () => {
    const onAgentChange = vi.fn();
    const user = userEvent.setup();
    const adapter = { fetch: fetchManifest };
    render(
      <ChatProvider adapter={adapter}>
        <AgentSelector selectedAgent="support" onAgentChange={onAgentChange} />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /Ada/ })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Ada/ }));
    expect(screen.getByRole('menuitem', { name: /Ada/ }).querySelector('svg')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /sales/ }));
    expect(onAgentChange).toHaveBeenCalledWith('sales');
  });

  it('renders the agent fallback without an avatar', async () => {
    const adapter = { fetch: fetchManifest };
    render(
      <ChatProvider adapter={adapter}>
        <AgentSelector selectedAgent="sales" onAgentChange={() => undefined} />
      </ChatProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /sales/ })).toBeTruthy());
    expect(screen.getByRole('button', { name: /sales/ }).querySelector('svg')).toBeTruthy();
  });
});
