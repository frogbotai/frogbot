import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChannelConversationNotice } from '../../../../packages/ui/src/chat/channel-conversation-notice';
import { Chat } from '../../../../packages/ui/src/chat/chat';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';
import type { ChatDocument } from '../../../../packages/ui/src/chat/use-chats';
import { QuestionToolRender } from '../../../../packages/ui/src/exports/chat-tools';

const api = 'https://frogbot.example/api';
const agent = 'support';
const chatId = 'chat-1';
const branchId = 'chat-2';

const question = {
  header: 'Target',
  question: 'Where should this deploy?',
  options: [{ label: 'Staging' }, { label: 'Production' }],
  custom: true,
};

const channelChat = {
  id: chatId,
  agent,
  title: 'Deploy thread',
  channel: 'slack',
  channelLabel: 'Slack',
  channelThread: {
    account: 'slack-support',
    thread: {
      _type: 'chat:Thread',
      adapterName: 'slack',
      channelId: 'slack:C1',
      id: 'slack:C1:1.000001',
      isDM: false,
    },
  },
} satisfies ChatDocument;

const webChat = {
  id: chatId,
  agent,
  title: 'Deploy thread',
  channel: null,
  channelLabel: null,
  channelThread: null,
};

const conversation = [
  {
    id: 'user-1',
    chat: chatId,
    role: 'user',
    parts: [{ type: 'text', text: 'Deploy it' }],
    status: 'active',
  },
  {
    id: 'assistant-1',
    chat: chatId,
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      {
        type: 'tool-question',
        toolCallId: 'call-1',
        state: 'input-available',
        input: { questions: [question] },
      },
    ],
    status: 'active',
  },
];

const branchConversation = [
  { ...conversation[0], id: 'branch-0', chat: branchId },
  {
    ...conversation[1],
    id: 'branch-1',
    chat: branchId,
    parts: [
      { type: 'step-start' },
      {
        type: 'tool-question',
        toolCallId: 'call-1',
        state: 'output-error',
        input: { questions: [question] },
        errorText: 'Interrupted before the tool call completed.',
      },
    ],
  },
];

type Route = (url: URL, init: RequestInit | undefined) => Response | Promise<Response> | undefined;

const server = {
  chats: {} as Record<string, unknown>,
  messages: {} as Record<string, unknown[]>,
  routes: [] as Route[],
  fetch: vi.fn<typeof fetch>(),
};

function requests(pathname: string, method = 'POST') {
  return server.fetch.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method,
  );
}

function renderChat(props: Partial<ComponentProps<typeof Chat>> = {}) {
  return render(
    <ChatProvider
      adapter={{ apiBase: api, fetch: server.fetch }}
      toolRenderers={[{ kind: 'question', render: QuestionToolRender }]}
    >
      <Chat
        agent={agent}
        defaultChatId={chatId}
        errorContent={(error) => error.message}
        {...props}
      />
    </ChatProvider>,
  );
}

describe('ChannelConversationNotice', () => {
  it('names the channel and branches on click', () => {
    const onBranch = vi.fn();

    render(<ChannelConversationNotice channelLabel="Slack" onBranch={onBranch} />);

    expect(screen.getByText('This conversation happens in Slack.')).toBeTruthy();
    expect(screen.getByText('Continue it there, or branch it into a new chat.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Branch' }));

    expect(onBranch).toHaveBeenCalledOnce();
  });

  it('disables Branch while a branch is in flight', () => {
    render(<ChannelConversationNotice channelLabel="Slack" branching onBranch={vi.fn()} />);

    expect((screen.getByRole('button', { name: 'Branch' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('hides Branch when there is nothing to branch', () => {
    const { container } = render(<ChannelConversationNotice channelLabel="Slack" />);

    expect(container.querySelector('.fb-channel-notice')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Branch' })).toBeNull();
  });
});

describe('QuestionToolRender in a read-only conversation', () => {
  const part = {
    type: 'dynamic-tool',
    toolName: 'question',
    toolCallId: 'call-1',
    state: 'input-available',
    input: { questions: [question] },
  } as const;

  it('waits for an answer in the channel without controls', () => {
    const { container } = render(
      <QuestionToolRender part={part} isReadonly channelLabel="Slack" />,
    );

    expect(container.querySelector('.fb-question-tool--waiting')).toBeTruthy();
    expect(screen.getByText('Waiting for an answer in Slack')).toBeTruthy();
    expect(screen.getByText('Where should this deploy?')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('waits for an answer without a channel name', () => {
    render(<QuestionToolRender part={part} isReadonly />);

    expect(screen.getByText('Waiting for an answer')).toBeTruthy();
  });

  it('still summarizes an answered question', () => {
    render(
      <QuestionToolRender
        part={{
          ...part,
          state: 'output-available',
          output: { answers: [{ header: 'Target', selected: ['Staging'] }] },
        }}
        isReadonly
        channelLabel="Slack"
      />,
    );

    expect(screen.getByText('Answered')).toBeTruthy();
    expect(screen.queryByText('Waiting for an answer in Slack')).toBeNull();
  });
});

describe('Chat for a channel conversation', () => {
  beforeEach(() => {
    server.chats = { [chatId]: channelChat, [branchId]: { id: branchId, agent, channel: null } };
    server.messages = { [chatId]: conversation, [branchId]: branchConversation };
    server.routes = [];
    server.fetch.mockReset();

    server.fetch.mockImplementation(async (input, init) => {
      const url = new URL(String(input));

      for (const route of server.routes) {
        const response = await route(url, init);

        if (response) return response;
      }

      if (url.pathname === '/api/frogbot') {
        return Response.json({
          chat: { enabled: true, chatsSlug: 'chats', messagesSlug: 'messages' },
          files: { slug: 'files' },
          agents: [{ slug: agent }],
        });
      }

      if (url.pathname === '/api/agents') return Response.json({ agents: [] });

      if (url.pathname === '/api/chats') return Response.json({ docs: [] });

      const chat = url.pathname.match(/^\/api\/chats\/([^/]+)$/)?.[1];

      if (chat && server.chats[chat]) return Response.json(server.chats[chat]);

      if (url.pathname === '/api/messages') {
        return Response.json({
          docs: server.messages[url.searchParams.get('where[chat][equals]') ?? ''] ?? [],
        });
      }

      return new Response(null, { status: 404 });
    });
  });

  it('replaces the composer with a notice naming the channel', async () => {
    const { container } = renderChat();

    expect(await screen.findByText('This conversation happens in Slack.')).toBeTruthy();
    expect(container.querySelector('.fb-composer')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows a pending question as waiting in the channel without controls', async () => {
    renderChat();

    expect(await screen.findByText('Waiting for an answer in Slack')).toBeTruthy();
    expect(screen.getByText('Where should this deploy?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Staging/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('falls back to the channel slug when the chat has no label', async () => {
    server.chats = { [chatId]: { ...channelChat, channelLabel: undefined } };

    renderChat();

    expect(await screen.findByText('This conversation happens in slack.')).toBeTruthy();
  });

  it('renders read-only from an initial chat without loading it', async () => {
    const { container } = renderChat({ chatId, initialChat: channelChat });

    expect(await screen.findByText('This conversation happens in Slack.')).toBeTruthy();

    await screen.findByText('Waiting for an answer in Slack');

    expect(container.querySelector('.fb-composer')).toBeNull();
    expect(requests(`/api/chats/${chatId}`, 'GET')).toHaveLength(0);
  });

  it('offers no edit action on channel messages', async () => {
    renderChat();

    await screen.findByText('This conversation happens in Slack.');

    expect((await screen.findAllByRole('button', { name: 'Copy' })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('branches at the last message and opens the private chat', async () => {
    server.routes.push((url) =>
      url.pathname === '/api/frogbot/chat/branch' ? Response.json({ chatId: branchId }) : undefined,
    );

    const { container } = renderChat();

    await screen.findByText('Waiting for an answer in Slack');

    const notice = screen
      .getByText('This conversation happens in Slack.')
      .closest('.fb-channel-notice') as HTMLElement;

    fireEvent.click(within(notice).getByRole('button', { name: 'Branch' }));

    await waitFor(() => expect(container.querySelector('.fb-composer')).toBeTruthy());

    expect(JSON.parse(String(requests('/api/frogbot/chat/branch')[0][1]?.body))).toEqual({
      chatId,
      messageId: 'assistant-1',
    });
    expect(await screen.findByText('Interrupted before the tool call completed.')).toBeTruthy();
    expect(screen.queryByText('This conversation happens in Slack.')).toBeNull();
  });

  it('keeps the composer for a web chat', async () => {
    server.chats = { [chatId]: webChat };

    const { container } = renderChat();

    expect(await screen.findByRole('button', { name: /Staging/ })).toBeTruthy();

    await waitFor(() => expect(requests(`/api/chats/${chatId}`, 'GET')).toHaveLength(1));

    expect(container.querySelector('.fb-composer')).toBeTruthy();
    expect(screen.queryByText(/This conversation happens in/)).toBeNull();
  });

  it('turns read-only when a send is refused as a channel conversation', async () => {
    let lookups = 0;

    server.routes.push(
      (url) => {
        if (url.pathname !== `/api/chats/${chatId}`) return undefined;

        lookups++;

        return lookups === 1 ? Response.json(webChat) : Response.json(channelChat);
      },
      (url) =>
        url.pathname === `/api/agents/${agent}`
          ? Response.json(
              {
                error:
                  'This conversation happens in Slack. Continue it there, or branch it into a new chat.',
                code: 'channel-chat',
              },
              { status: 409 },
            )
          : undefined,
    );

    const { container } = renderChat();

    await screen.findByRole('button', { name: /Staging/ });
    await waitFor(() => expect(lookups).toBe(1));

    const composer = container.querySelector('.fb-composer__textarea') as HTMLTextAreaElement;

    fireEvent.change(composer, { target: { value: 'Ship it anyway' } });
    fireEvent.keyDown(composer, { key: 'Enter' });

    expect(await screen.findByText('This conversation happens in Slack.')).toBeTruthy();
    expect(container.querySelector('.fb-composer')).toBeNull();

    await waitFor(() => expect(screen.queryByText('Ship it anyway')).toBeNull());
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
