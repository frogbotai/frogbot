import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AgentSelector } from '../../../../packages/ui/src/chat/agent-selector';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';
import { createRestChatAdapter } from '../../../../packages/ui/src/chat/rest/adapter';

const manifest = {
  ai: { transcribe: false as const, speak: false as const },
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
    const adapter = createRestChatAdapter({ fetch: fetchManifest });

    render(
      <ChatProvider adapter={adapter}>
        <AgentSelector selectedAgent="support" onAgentChange={onAgentChange} />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /Ada/ })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Ada/ }));

    expect(
      screen.getByRole('menuitem', { name: /Ada/ }).querySelector('img')?.getAttribute('src'),
    ).toBe('/ada.png');
    expect(
      screen.getByRole('menuitem', { name: /sales/ }).querySelector('.lucide-brand-frog-bot-icon'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: /sales/ }));

    expect(onAgentChange).toHaveBeenCalledWith('sales');
  });

  it('shows the FrogBot face, not the robot, for an agent without an avatar', async () => {
    const adapter = createRestChatAdapter({ fetch: fetchManifest });

    render(
      <ChatProvider adapter={adapter}>
        <AgentSelector selectedAgent="sales" onAgentChange={() => undefined} />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /sales/ })).toBeTruthy());

    const trigger = screen.getByRole('button', { name: /sales/ });

    expect(trigger.querySelector('.lucide-brand-frog-bot-icon')).toBeTruthy();
    expect(trigger.querySelector('.lucide-robot-icon')).toBeNull();
    expect(trigger.querySelector('img')).toBeNull();
  });

  it("shows the agent's avatar in the trigger", async () => {
    const adapter = createRestChatAdapter({ fetch: fetchManifest });

    render(
      <ChatProvider adapter={adapter}>
        <AgentSelector selectedAgent="support" onAgentChange={() => undefined} />
      </ChatProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /Ada/ })).toBeTruthy());

    const trigger = screen.getByRole('button', { name: /Ada/ });

    expect(trigger.querySelector('img')?.getAttribute('src')).toBe('/ada.png');
    expect(trigger.querySelector('svg.fb-composer-select__icon')).toBeNull();
  });
});
