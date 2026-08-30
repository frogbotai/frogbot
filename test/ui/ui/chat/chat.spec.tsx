import { createFrogbotSDK } from '@frogbotai/sdk';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  status: 'ready',
  error: undefined as Error | undefined,
  messages: [] as import('ai').UIMessage[],
  sendMessage: vi.fn(),
  stop: vi.fn(),
  setMessages: vi.fn(),
  addToolOutput: vi.fn(),
  options: undefined as import('@ai-sdk/react').UseChatOptions | undefined,
  refresh: vi.fn(),
  adapter: {
    fetch: vi.fn(),
    buildMetadata: vi.fn(() => ({ source: 'ui' })),
    executeClientTool: vi.fn(),
  },
  sdk: undefined as unknown as ReturnType<typeof createFrogbotSDK>,
  agents: [] as Array<{ slug: string; profile?: { name?: string; avatar?: string } }>,
  history: {
    messages: [] as import('ai').UIMessage[],
    loadedChatId: undefined as string | undefined,
    loading: false,
  },
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: import('@ai-sdk/react').UseChatOptions) => {
    state.options = options;
    return state;
  },
}));
vi.mock('../../../../packages/ui/src/chat/provider', () => ({
  useChatProvider: () => ({
    adapter: state.adapter,
    sdk: state.sdk,
    loading: false,
    manifest: {
      ai: { transcribe: false },
      chat: { enabled: true, chatsSlug: 'chats', messagesSlug: 'messages' },
      files: { slug: 'files' },
      agents: state.agents,
    },
  }),
}));
vi.mock('../../../../packages/ui/src/chat/use-chat', () => ({
  useChatMessages: () => state.history,
}));
vi.mock('../../../../packages/ui/src/chat/use-chats', () => ({
  emitChatMutation: vi.fn(),
  useChats: () => ({
    docs: [
      { id: 'one', agent: 'support', title: 'One' },
      { id: 'two', agent: 'support', title: null },
    ],
    loading: false,
    refresh: state.refresh,
  }),
}));

import { Chat, type ChatSidebarContext } from '../../../../packages/ui/src/chat/chat';
import { ChatHistory } from '../../../../packages/ui/src/chat/chat-history';

const renderSidebar = (context: ChatSidebarContext) => (
  <ChatHistory
    chats={context.chats}
    activeChatId={context.activeChatId}
    fallbackTitle="Untitled"
    onChatChange={context.selectChat}
  />
);

const props = {
  agent: 'support',
  submitContent: 'Send',
  stopContent: 'Stop',
  fallbackTitle: 'Untitled',
  emptyContent: 'Empty',
  errorContent: (error: Error) => error.message,
  abortedContent: 'Aborted',
  renderSidebar,
};
const message: import('ai').UIMessage = {
  id: 'user-1',
  role: 'user',
  parts: [{ type: 'text', text: 'Hello' }],
};

async function sendTransportMessage() {
  state.adapter.fetch.mockResolvedValue(
    new Response(new ReadableStream({ start: (controller) => controller.close() })),
  );
  const transport = (state.options as import('ai').ChatInit<import('ai').UIMessage>).transport;
  await transport?.sendMessages({
    trigger: 'submit-message',
    chatId: 'chat',
    messageId: message.id,
    messages: [message],
    abortSignal: undefined,
  });
  return JSON.parse(state.adapter.fetch.mock.calls[0][1].body as string);
}

describe('Chat', () => {
  beforeEach(() => {
    state.sdk = createFrogbotSDK({ baseURL: '/api', fetch: state.adapter.fetch });
    state.status = 'ready';
    state.error = undefined;
    state.messages = [];
    state.sendMessage.mockReset();
    state.stop.mockReset();
    state.setMessages.mockReset();
    state.addToolOutput.mockReset();
    state.refresh.mockReset();
    state.adapter.executeClientTool.mockReset();
    state.adapter.fetch.mockReset();
    state.history = { messages: [], loadedChatId: undefined, loading: false };
    state.agents = [];
  });

  it('seeds AI SDK chat state with prefetched messages', () => {
    render(<Chat {...props} chatId="chat-1" initialMessages={[message]} />);

    expect(state.options).toMatchObject({ id: 'chat-1', messages: [message] });
  });

  it('renders no sidebar by default', () => {
    const { container } = render(<Chat agent="support" />);
    expect(container.querySelector('.fb-chat-shell__sidebar')).toBeNull();
  });

  it('renders a caller-provided sidebar with history context', () => {
    const { container } = render(<Chat {...props} defaultChatId="one" />);
    expect(container.querySelector('.fb-chat-shell__sidebar')).toBeTruthy();
    expect(screen.getByText('One').getAttribute('aria-current')).toBe('page');
  });

  it('forwards custom message rendering', () => {
    state.messages = [
      { id: 'assistant', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
    ];
    render(<Chat agent="support" renderMessage={(item) => <div>Custom {item.id}</div>} />);
    expect(screen.getByText('Custom assistant')).toBeTruthy();
  });

  it('renders header slot content above the message list', () => {
    state.agents = [{ slug: 'support', profile: { name: 'Ada' } }];
    state.messages = [
      { id: 'assistant', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
    ];
    render(<Chat agent="support" headerSlot={<div>Agent controls</div>} />);
    const header = screen.getByText('Agent controls');
    const message = screen.getByText('Hello');
    expect(header.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders a configured assistant profile avatar', () => {
    state.agents = [{ slug: 'support', profile: { name: 'Ada', avatar: '/ada.png' } }];
    state.messages = [
      { id: 'assistant', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
    ];
    render(<Chat agent="support" />);
    expect(screen.getByRole('img', { name: 'Ada' }).getAttribute('src')).toBe('/ada.png');
  });

  it('renders profile initials when the avatar is omitted', () => {
    state.agents = [{ slug: 'support', profile: { name: 'Ada Lovelace' } }];
    state.messages = [
      { id: 'assistant', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
    ];
    render(<Chat agent="support" />);
    expect(screen.getByText('AL')).toBeTruthy();
  });

  it('keeps messages unchanged without a profile', () => {
    state.messages = [
      { id: 'assistant', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
    ];
    render(<Chat agent="support" />);
    expect(
      screen.getByText('Hello').closest('[data-message]')?.firstElementChild?.textContent,
    ).toBe('Hello');
  });

  it('submits metadata and updates uncontrolled history', async () => {
    const onChatIdChange = vi.fn();
    render(<Chat {...props} defaultChatId="one" onChatIdChange={onChatIdChange} />);
    fireEvent.click(screen.getByText('Untitled'));
    expect(onChatIdChange).toHaveBeenCalledWith('two');
    expect(screen.getByText('Untitled').getAttribute('aria-current')).toBe('page');
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(state.sendMessage).toHaveBeenCalledWith({
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { source: 'ui' },
      }),
    );
  });

  it('submits long pasted text as data-paste', async () => {
    render(<Chat agent="support" />);
    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: { getData: () => 'p'.repeat(651) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(state.sendMessage).toHaveBeenCalledWith({
        parts: [
          {
            type: 'data-paste',
            data: { text: 'p'.repeat(651), filename: expect.stringMatching(/^pasted-\d+\.txt$/) },
          },
        ],
        metadata: { source: 'ui' },
      }),
    );
    expect(state.adapter.fetch).not.toHaveBeenCalled();
  });

  it('sends the strict request body for a new chat', async () => {
    render(<Chat agent="support" />);
    expect(await sendTransportMessage()).toEqual({ messages: [message] });
  });

  it('sends the strict request body for an existing chat', async () => {
    render(<Chat agent="support" defaultChatId="chat-1" />);
    expect(await sendTransportMessage()).toEqual({ messages: [message], chatId: 'chat-1' });
  });

  it('carries a server-created chat id into the next turn on the same transport', async () => {
    render(<Chat agent="support" />);
    const chatInit = () => state.options as import('ai').ChatInit<import('ai').UIMessage>;
    const transport = chatInit().transport;
    const send = () =>
      transport?.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat',
        messageId: message.id,
        messages: [message],
        abortSignal: undefined,
      });
    state.adapter.fetch.mockResolvedValue(
      new Response(new ReadableStream({ start: (controller) => controller.close() }), {
        headers: { 'X-Frogbot-Chat-Id': 'chat-9' },
      }),
    );

    await send();
    expect(JSON.parse(state.adapter.fetch.mock.calls[0][1].body as string)).toEqual({
      messages: [message],
    });

    await act(async () => {
      await (state.options as { onFinish?: () => void }).onFinish?.();
    });

    expect(chatInit().transport).toBe(transport);
    await send();
    expect(JSON.parse(state.adapter.fetch.mock.calls[1][1].body as string)).toEqual({
      messages: [message],
      chatId: 'chat-9',
    });
  });

  it('reports controlled changes without replacing the active chat', () => {
    const onChatIdChange = vi.fn();
    render(<Chat {...props} chatId="one" onChatIdChange={onChatIdChange} />);
    fireEvent.click(screen.getByText('Untitled'));
    expect(onChatIdChange).toHaveBeenCalledWith('two');
    expect(screen.getByText('One').getAttribute('aria-current')).toBe('page');
  });

  it('works with only an agent and derives an untitled active chat', () => {
    state.messages = [
      { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Derived conversation title' }] },
    ];
    render(<Chat agent="support" defaultChatId="two" renderSidebar={renderSidebar} />);
    expect(
      screen
        .getByRole('button', { name: 'Derived conversation title' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });

  it('executes client tools and records their output', async () => {
    state.adapter.executeClientTool.mockResolvedValue('complete');
    render(<Chat agent="support" />);
    await state.options?.onToolCall?.({
      toolCall: {
        type: 'dynamic-tool',
        toolName: 'lookup',
        toolCallId: 'call',
        state: 'input-available',
        input: { id: 1 },
      },
    });
    expect(state.adapter.executeClientTool).toHaveBeenCalledWith('lookup', { id: 1 });
    expect(state.addToolOutput).toHaveBeenCalledWith({
      tool: 'lookup',
      toolCallId: 'call',
      output: 'complete',
    });
  });

  it('does not replace live messages when a new chat ID arrives', async () => {
    state.messages = [
      { id: 'live', role: 'assistant', parts: [{ type: 'text', text: 'Live response' }] },
    ];
    state.adapter.fetch.mockResolvedValue(
      new Response(new ReadableStream({ start: (controller) => controller.close() }), {
        headers: { 'X-Frogbot-Chat-Id': 'created' },
      }),
    );
    const { rerender } = render(<Chat agent="support" />);
    const transport = (state.options as import('ai').ChatInit<import('ai').UIMessage>).transport;
    await transport?.sendMessages({
      trigger: 'submit-message',
      chatId: 'new:support',
      messageId: undefined,
      messages: state.messages,
      abortSignal: undefined,
    });
    state.options?.onFinish?.({
      message: state.messages[0],
      messages: state.messages,
      isAbort: false,
      isDisconnect: false,
      isError: false,
    });
    state.history = {
      messages: [{ id: 'stale', role: 'user', parts: [{ type: 'text', text: 'Stale history' }] }],
      loadedChatId: 'created',
      loading: false,
    };
    rerender(<Chat agent="support" />);
    expect(state.setMessages).not.toHaveBeenCalled();
    expect(state.refresh).toHaveBeenCalledOnce();
  });

  it('refreshes history after rename and delete', async () => {
    state.messages = [{ id: 'old', role: 'user', parts: [{ type: 'text', text: 'Old chat' }] }];
    state.adapter.fetch.mockImplementation(async (input) =>
      String(input).startsWith('/api/messages?') ? Response.json({ docs: [] }) : Response.json({}),
    );
    render(
      <Chat
        agent="support"
        defaultChatId="one"
        renderSidebar={(context) => (
          <>
            {context.chats.map((chat) => {
              const actions = context.actions(chat);
              return (
                <div key={chat.id}>
                  <button onClick={() => void actions.rename('Renamed')}>Rename {chat.id}</button>
                  <button onClick={() => void actions.delete()}>Delete {chat.id}</button>
                </div>
              );
            })}
          </>
        )}
      />,
    );
    fireEvent.click(screen.getByText('Rename one'));
    await waitFor(() => expect(state.refresh).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('Delete one'));
    await waitFor(() => expect(state.refresh).toHaveBeenCalledTimes(2));
    expect(state.setMessages).toHaveBeenCalledWith([]);
  });

  it('treats an explicit undefined chatId as controlled and clears the conversation', async () => {
    state.messages = [{ id: 'old', role: 'user', parts: [{ type: 'text', text: 'Old chat' }] }];
    const onChatIdChange = vi.fn();
    const { rerender } = render(
      <Chat agent="support" chatId="one" onChatIdChange={onChatIdChange} />,
    );
    state.setMessages.mockClear();
    rerender(<Chat agent="support" chatId={undefined} onChatIdChange={onChatIdChange} />);
    await waitFor(() => expect(state.setMessages).toHaveBeenCalledWith([]));
    expect(onChatIdChange).not.toHaveBeenCalled();
  });

  it('retains the active chat and messages when the agent changes', () => {
    state.messages = [{ id: 'old', role: 'user', parts: [{ type: 'text', text: 'Old agent' }] }];
    const onChatIdChange = vi.fn();
    const { rerender } = render(
      <Chat agent="support" defaultChatId="one" onChatIdChange={onChatIdChange} />,
    );
    state.setMessages.mockClear();
    rerender(<Chat agent="sales" defaultChatId="one" onChatIdChange={onChatIdChange} />);
    expect(state.setMessages).not.toHaveBeenCalled();
    expect(onChatIdChange).not.toHaveBeenCalled();
    expect(screen.getByText('Old agent')).toBeTruthy();
  });

  it('stops and renders injected abort and stream error content', () => {
    state.status = 'streaming';
    state.error = new Error('Stream failed');
    render(<Chat {...props} />);
    expect(screen.getByText('Stream failed')).toBeTruthy();
    fireEvent.click(screen.getByText('Stop'));
    expect(state.stop).toHaveBeenCalledOnce();
    expect(screen.getByText('Aborted')).toBeTruthy();
  });
});
