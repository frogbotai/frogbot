import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ChatInit, UIMessage } from 'ai';
import { APICallError } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  status: 'ready',
  error: undefined as Error | undefined,
  messages: [] as UIMessage[],
  sendMessage: vi.fn(),
  stop: vi.fn(),
  setMessages: vi.fn(),
  addToolOutput: vi.fn(),
  clearError: vi.fn(),
  options: undefined as ChatInit<UIMessage> | undefined,
  refresh: vi.fn(),
  fetch: vi.fn(),
  buildMetadata: vi.fn(() => ({ source: 'ui' })),
  executeClientTool: vi.fn(),
  adapter: undefined as unknown as ChatPlatformAdapter,
  agents: [] as ChatManifest['agents'],
  toolRenderers: [] as ToolRenderer[],
  commands: [] as ComposerCommand[],
  dataRenderers: [] as DataRenderer[],
  history: {
    messages: [] as UIMessage[],
    queued: [] as UIMessage[],
    loadedChatId: undefined as string | undefined,
    loading: false,
  },
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: ChatInit<UIMessage>) => {
    state.options = options;

    return state;
  },
}));

vi.mock('../../../../packages/ui/src/chat/provider', () => ({
  useChatProvider: () => ({
    adapter: state.adapter,
    loading: false,
    manifest: { defaultAgent: 'support', agents: state.agents, transcribe: false },
    toolRenderers: state.toolRenderers,
    dataRenderers: state.dataRenderers,
    commands: state.commands,
  }),
}));

vi.mock('../../../../packages/ui/src/chat/use-chat', () => ({
  useChatMessages: () => state.history,
}));

vi.mock('../../../../packages/ui/src/chat/use-chats', () => ({
  emitChatMutation: vi.fn(),
  useChatDocument: () => ({ refresh: vi.fn() }),
  useChats: () => ({
    docs: [
      { id: 'one', agent: 'support', title: 'One' },
      { id: 'two', agent: 'support', title: null },
    ],
    loading: false,
    refresh: state.refresh,
  }),
}));

import type { ChatManifest } from '@frogbotai/protocol';

import type { ChatPlatformAdapter } from '../../../../packages/ui/src/chat/adapter';
import { Chat, type ChatSidebarContext } from '../../../../packages/ui/src/chat/chat';
import { ChatDock } from '../../../../packages/ui/src/chat/chat-dock';
import { ChatHistory } from '../../../../packages/ui/src/chat/chat-history';
import type { ComposerCommand } from '../../../../packages/ui/src/chat/composer/context';
import type { DataRenderer } from '../../../../packages/ui/src/chat/data-part';
import { createRestChatAdapter } from '../../../../packages/ui/src/chat/rest/adapter';
import { SteeredPart } from '../../../../packages/ui/src/chat/steered-part';
import type {
  ToolRenderer,
  ToolRendererProps,
} from '../../../../packages/ui/src/chat/tool-registry';
import { emitChatMutation } from '../../../../packages/ui/src/chat/use-chats';
import { composerText, insertMention, paste, press, type } from './composerEditor';

const supportAgent: ChatManifest['agents'][number] = {
  slug: 'support',
  label: 'Support',
  source: 'config',
  defaultModel: 'openai/gpt-4o',
  models: ['openai/gpt-4o'],
};

function setAdapter(assetsSlug?: string, omit: string[] = assetsSlug ? [] : ['uploadAttachment']) {
  const adapter: ChatPlatformAdapter = {
    ...createRestChatAdapter({
      fetch: state.fetch,
      chatsSlug: 'chats',
      messagesSlug: 'messages',
      assetsSlug,
    }),
    buildMetadata: state.buildMetadata,
    executeClientTool: state.executeClientTool,
  };

  state.adapter = Object.fromEntries(
    Object.entries(adapter).filter(([key]) => !omit.includes(key)),
  ) as ChatPlatformAdapter;
}

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

const message: UIMessage = {
  id: 'user-1',
  role: 'user',
  parts: [{ type: 'text', text: 'Hello' }],
};

async function sendTransportMessage() {
  state.fetch.mockResolvedValue(
    new Response(new ReadableStream({ start: (controller) => controller.close() })),
  );

  const transport = (state.options as ChatInit<UIMessage>).transport;

  await transport?.sendMessages({
    trigger: 'submit-message',
    chatId: 'chat',
    messageId: message.id,
    messages: [message],
    abortSignal: undefined,
  });

  return JSON.parse(state.fetch.mock.calls[0][1].body as string);
}

describe('Chat', () => {
  beforeEach(() => {
    state.status = 'ready';
    state.error = undefined;
    state.messages = [];
    state.sendMessage.mockReset();
    state.stop.mockReset();
    state.setMessages.mockReset();
    state.addToolOutput.mockReset();
    state.refresh.mockReset();
    state.executeClientTool.mockReset();
    state.fetch.mockReset();
    state.history = { messages: [], queued: [], loadedChatId: undefined, loading: false };
    state.agents = [];
    state.toolRenderers = [];
    vi.mocked(emitChatMutation).mockClear();
    setAdapter();
  });

  it('seeds AI SDK chat state with prefetched messages', () => {
    render(<Chat {...props} chatId="chat-1" initialMessages={[message]} />);

    expect(state.options).toMatchObject({ id: 'chat-1', messages: [message] });
  });

  it('renders no sidebar by default', () => {
    const { container } = render(<Chat agent="support" />);

    expect(container.querySelector('.fb-chat-shell__sidebar')).toBeNull();
  });

  it('passes its placeholder to the composer', () => {
    render(<Chat agent="support" placeholder="Ask about this page" />);

    expect(screen.getByText('Ask about this page')).toBeTruthy();
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
    state.agents = [{ ...supportAgent, profile: { name: 'Ada' } }];

    state.messages = [
      { id: 'assistant', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
    ];

    render(<Chat agent="support" headerSlot={<div>Agent controls</div>} />);
    const header = screen.getByText('Agent controls');
    const message = screen.getByText('Hello');

    expect(header.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders a configured assistant profile avatar', () => {
    state.agents = [{ ...supportAgent, profile: { name: 'Ada', avatar: '/ada.png' } }];

    state.messages = [
      { id: 'assistant', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
    ];

    render(<Chat agent="support" />);

    expect(screen.getByRole('img', { name: 'Ada' }).getAttribute('src')).toBe('/ada.png');
  });

  it('renders profile initials when the avatar is omitted', () => {
    state.agents = [{ ...supportAgent, profile: { name: 'Ada Lovelace' } }];

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
    const message = screen.getByText('Hello').closest('[data-message]');

    expect(message?.querySelector('.fb-chat__assistant-avatar')).toBeNull();
    expect(message?.querySelector('.fb-message__content')?.textContent).toBe('Hello');
  });

  it('submits metadata and updates uncontrolled history', async () => {
    const onChatIdChange = vi.fn();
    render(<Chat {...props} defaultChatId="one" onChatIdChange={onChatIdChange} />);
    fireEvent.click(screen.getByText('Untitled'));

    expect(onChatIdChange).toHaveBeenCalledWith('two');
    expect(screen.getByText('Untitled').getAttribute('aria-current')).toBe('page');

    type('Hello');
    press('Enter');

    await waitFor(() =>
      expect(state.sendMessage).toHaveBeenCalledWith({
        parts: [{ type: 'text', text: 'Hello' }],
        metadata: { source: 'ui' },
      }),
    );
  });

  it('uploads long pasted text and sends it as a pasted file reference', async () => {
    setAdapter('assets');

    state.fetch.mockResolvedValue(
      Response.json({ doc: { id: 'asset-1', filename: 'pasted-1.txt', mimeType: 'text/plain' } }),
    );

    render(<Chat agent="support" />);

    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: { getData: () => 'p'.repeat(651) },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(state.sendMessage).toHaveBeenCalledWith({
        parts: [
          {
            type: 'file-reference',
            id: 'asset-1',
            filename: 'Pasted text',
            mediaType: 'text/plain',
            origin: 'paste',
          },
        ],
        metadata: { source: 'ui' },
      }),
    );

    expect(String(state.fetch.mock.calls[0]?.[0])).toBe('/api/assets');
  });

  it("gives the composer the selected model's file types and name", async () => {
    setAdapter('assets');

    state.agents = [
      {
        slug: 'support',
        label: 'Support',
        source: 'config',
        defaultModel: 'openai/gpt-4o',
        models: ['openai/gpt-4o', 'openai/gpt-4o-mini'],
        names: { 'openai/gpt-4o-mini': 'Text Only' },
        inputs: { 'openai/gpt-4o-mini': ['text'] },
      },
    ];

    const { container, rerender } = render(<Chat agent="support" />);
    const accept = () => container.querySelector('input[type="file"]')?.getAttribute('accept');

    expect(accept()).toContain('image/png');

    rerender(<Chat agent="support" model="openai/gpt-4o-mini" />);

    expect(accept()).not.toContain('image/png');

    fireEvent.drop(container.querySelector('form') as HTMLFormElement, {
      dataTransfer: {
        files: [new File([new Uint8Array([0x89, 0x50])], 'photo.png', { type: 'image/png' })],
      },
    });

    const card = await screen.findByRole('group', { name: "photo.png, PNG, won't be sent" });

    expect(card.textContent).toContain("Text Only can't read images.");
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it('submits long pasted text as data-paste without upload storage', async () => {
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

    expect(state.fetch).not.toHaveBeenCalled();
  });

  it('sends the strict request body for a new chat', async () => {
    render(<Chat agent="support" />);

    expect(await sendTransportMessage()).toEqual({ messages: [message] });
  });

  it('sends the strict request body for an existing chat', async () => {
    render(<Chat agent="support" defaultChatId="chat-1" />);

    expect(await sendTransportMessage()).toEqual({ messages: [message], chatId: 'chat-1' });
  });

  it('sends the selected model and reasoning level with the message', async () => {
    render(<Chat agent="support" model="openai/gpt-5" reasoning="high" />);

    expect(await sendTransportMessage()).toEqual({
      messages: [message],
      model: 'openai/gpt-5',
      reasoning: 'high',
    });
  });

  it('carries a server-created chat id into the next turn on the same transport', async () => {
    render(<Chat agent="support" />);
    const chatInit = () => state.options as ChatInit<UIMessage>;
    const transport = chatInit().transport;
    const send = () =>
      transport?.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat',
        messageId: message.id,
        messages: [message],
        abortSignal: undefined,
      });

    state.fetch.mockResolvedValue(
      new Response(new ReadableStream({ start: (controller) => controller.close() }), {
        headers: { 'X-FrogBot-Chat-Id': 'chat-9' },
      }),
    );

    await send();

    expect(JSON.parse(state.fetch.mock.calls[0][1].body as string)).toEqual({
      messages: [message],
    });

    act(() => {
      state.options?.onFinish?.({
        message,
        messages: [message],
        isAbort: false,
        isDisconnect: false,
        isError: false,
      });
    });

    expect(chatInit().transport).toBe(transport);

    await send();

    expect(JSON.parse(state.fetch.mock.calls[1][1].body as string)).toEqual({
      messages: [message],
      chatId: 'chat-9',
    });
  });

  it('broadcasts a delayed refresh after a new chat finishes', async () => {
    vi.useFakeTimers();
    render(<Chat agent="support" />);

    state.fetch.mockResolvedValue(
      new Response(new ReadableStream({ start: (controller) => controller.close() }), {
        headers: { 'X-FrogBot-Chat-Id': 'chat-9' },
      }),
    );

    const transport = (state.options as ChatInit<UIMessage>).transport;

    await transport?.sendMessages({
      trigger: 'submit-message',
      chatId: 'new:support',
      messageId: message.id,
      messages: [message],
      abortSignal: undefined,
    });

    vi.mocked(emitChatMutation).mockClear();

    state.options?.onFinish?.({
      message,
      messages: [message],
      isAbort: false,
      isDisconnect: false,
      isError: false,
    });

    expect(emitChatMutation).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_500);

    expect(emitChatMutation).toHaveBeenCalledOnce();

    vi.useRealTimers();
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
    state.executeClientTool.mockResolvedValue('complete');
    render(<Chat agent="support" />);

    await state.options?.onToolCall?.({
      toolCall: { dynamic: true, toolName: 'lookup', toolCallId: 'call', input: { id: 1 } },
    });

    expect(state.executeClientTool).toHaveBeenCalledWith('lookup', { id: 1 });
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

    state.fetch.mockResolvedValue(
      new Response(new ReadableStream({ start: (controller) => controller.close() }), {
        headers: { 'X-FrogBot-Chat-Id': 'created' },
      }),
    );

    const { rerender } = render(<Chat agent="support" />);
    const transport = (state.options as ChatInit<UIMessage>).transport;

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
      queued: [],
      loadedChatId: 'created',
      loading: false,
    };

    rerender(<Chat agent="support" />);

    expect(state.setMessages).not.toHaveBeenCalled();
    expect(state.refresh).toHaveBeenCalledOnce();
  });

  it('refreshes history after rename and delete', async () => {
    state.messages = [{ id: 'old', role: 'user', parts: [{ type: 'text', text: 'Old chat' }] }];

    state.fetch.mockImplementation((input) =>
      Promise.resolve(
        String(input).startsWith('/api/messages?')
          ? Response.json({ docs: [] })
          : Response.json({}),
      ),
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
                  <button onClick={() => void actions.rename?.('Renamed')}>Rename {chat.id}</button>
                  <button onClick={() => void actions.delete?.()}>Delete {chat.id}</button>
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

  it('emits one chat mutation per rename, branch and delete', async () => {
    state.messages = [
      { id: 'assistant', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
    ];

    state.fetch.mockImplementation((input) =>
      Promise.resolve(
        String(input).startsWith('/api/messages?')
          ? Response.json({ docs: [] })
          : String(input) === '/api/frogbot/chat/branch'
            ? Response.json({ chatId: 'branched' })
            : Response.json({}),
      ),
    );

    render(
      <Chat
        agent="support"
        defaultChatId="one"
        renderSidebar={(context) => (
          <>
            <button onClick={() => void context.actions(context.chats[0]).rename?.('Renamed')}>
              Rename
            </button>
            <button onClick={() => void context.actions(context.chats[0]).delete?.()}>
              Delete
            </button>
          </>
        )}
      />,
    );

    fireEvent.click(screen.getByText('Rename'));
    await waitFor(() => expect(emitChatMutation).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Branch' }));
    await waitFor(() => expect(emitChatMutation).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(emitChatMutation).toHaveBeenCalledTimes(3));
  });

  it('hides branch, attach and row actions the adapter does not provide', () => {
    const actions = vi.fn();

    setAdapter(undefined, ['uploadAttachment', 'branchChat', 'renameChat', 'deleteChat']);

    state.messages = [
      { id: 'assistant', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
    ];

    render(
      <Chat
        agent="support"
        defaultChatId="one"
        renderSidebar={(context) => {
          actions(context.actions(context.chats[0]));

          return null;
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Branch' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add files' })).toBeNull();
    expect(actions).toHaveBeenLastCalledWith({ rename: undefined, delete: undefined });
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

  it('reports a failed turn through onError with a displayable message', () => {
    const onError = vi.fn();

    render(<Chat {...props} onError={onError} />);
    act(() => state.options?.onError?.(new Error('The AI provider rejected the API key.')));

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toBe('The AI provider rejected the API key.');
  });

  it('reports the server message of a rejected turn request', async () => {
    const onError = vi.fn();

    render(<Chat {...props} onError={onError} />);
    act(() => state.options?.onError?.(turnRequestError('selection-unavailable')));

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(onError.mock.calls[0][0].message).toBe('The selected model is unavailable.');
  });

  it('does not report turn conflicts that recover silently', async () => {
    const onError = vi.fn();

    render(<Chat {...props} onError={onError} />);
    act(() => state.options?.onError?.(turnRequestError('already-settled')));

    await waitFor(() => expect(state.clearError).toHaveBeenCalledOnce());

    expect(onError).not.toHaveBeenCalled();
  });

  it('renders a default inline error without errorContent', () => {
    state.error = turnRequestError('selection-unavailable');

    render(<Chat agent="support" />);

    expect(screen.getByRole('alert').textContent).toBe('The selected model is unavailable.');
  });

  it('renders no inline error when errorContent is false', () => {
    state.error = new Error('Stream failed');

    render(<Chat agent="support" errorContent={false} />);

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

function composer(container: HTMLElement) {
  return container.querySelector<HTMLFormElement>('.fb-composer');
}

function Question({ addToolOutput, part }: ToolRendererProps) {
  return (
    <div data-testid={`question-${part.state}`}>
      {addToolOutput && (
        <button type="button" onClick={() => void addToolOutput({ answer: 'Staging' })}>
          Answer
        </button>
      )}
    </div>
  );
}

function questionMessage(state: 'input-available' | 'output-available'): UIMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    parts: [
      {
        type: 'dynamic-tool',
        toolName: 'question',
        toolCallId: 'call-1',
        state,
        input: {},
        ...(state === 'output-available' ? { output: { answer: 'Staging' } } : {}),
      } as UIMessage['parts'][number],
    ],
  };
}

describe('Chat dock', () => {
  beforeEach(() => {
    state.status = 'ready';
    state.error = undefined;
    state.messages = [];
    state.sendMessage.mockReset();
    state.addToolOutput.mockReset();
    state.history = { messages: [], queued: [], loadedChatId: undefined, loading: false };
    state.agents = [];
    state.toolRenderers = [];
    setAdapter();
  });

  it('changes nothing without a dock slot', () => {
    const { container } = render(<Chat agent="support" />);

    expect(container.querySelector('.fb-chat__dock')).toBeNull();
    expect(composer(container)?.hidden).toBe(false);
  });

  it('renders the dock slot between the queued list and the composer', () => {
    state.history = {
      messages: [message],
      queued: [{ id: 'queued-1', role: 'user', parts: [{ type: 'text', text: 'Later' }] }],
      loadedChatId: 'one',
      loading: false,
    };

    const { container } = render(
      <Chat agent="support" defaultChatId="one" dockSlot={<div>Plan card</div>} />,
    );

    const dock = container.querySelector('.fb-chat__dock') as HTMLElement;
    const queued = container.querySelector('.fb-chat__queued') as HTMLElement;
    const form = composer(container) as HTMLFormElement;

    expect(dock.parentElement?.className).toBe('fb-chat__composer');
    expect(dock.textContent).toBe('Plan card');
    expect(queued.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dock.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(form.hidden).toBe(false);
  });

  it('renders a dock card with a header, content and footer', () => {
    const { container } = render(
      <ChatDock header="Allow edit?" footer={<button type="button">Allow</button>}>
        Edit src/index.ts
      </ChatDock>,
    );

    const dock = container.querySelector('.fb-chat-dock') as HTMLElement;

    expect([...dock.children].map((child) => [child.className, child.textContent])).toEqual([
      ['fb-chat-dock__header', 'Allow edit?'],
      ['fb-chat-dock__content', 'Edit src/index.ts'],
      ['fb-chat-dock__footer', 'Allow'],
    ]);
  });

  it('hides the composer while the dock blocks and keeps its text', () => {
    const { container, rerender } = render(<Chat agent="support" />);

    type('Half a thought');

    rerender(<Chat agent="support" dockSlot={<div>Allow?</div>} dockBlocking />);

    expect(composer(container)?.hidden).toBe(true);

    rerender(<Chat agent="support" dockSlot={<div>Allow?</div>} />);

    expect(composer(container)?.hidden).toBe(false);
    expect(composerText()).toBe('Half a thought');
  });

  it('docks a waiting question above the dock slot and hides the composer', () => {
    state.toolRenderers = [{ kind: 'question', render: Question }];
    state.messages = [message, questionMessage('input-available')];

    const { container } = render(<Chat agent="support" dockSlot={<div>Plan card</div>} />);

    const dock = container.querySelector('.fb-chat__dock') as HTMLElement;
    const question = screen.getByTestId('question-input-available');

    expect(dock.contains(question)).toBe(true);
    expect(question.compareDocumentPosition(screen.getByText('Plan card'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(container.querySelector('.fb-message-list')?.contains(question)).toBe(false);
    expect(composer(container)?.hidden).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));

    expect(state.addToolOutput).toHaveBeenCalledWith({
      tool: 'question',
      toolCallId: 'call-1',
      output: { answer: 'Staging' },
    });
  });

  it('shows an answered question inline only and brings the composer back', () => {
    state.toolRenderers = [{ kind: 'question', render: Question }];
    state.messages = [message, questionMessage('output-available')];

    const { container } = render(<Chat agent="support" />);

    const question = screen.getByTestId('question-output-available');

    expect(container.querySelector('.fb-chat__dock')).toBeNull();
    expect(container.querySelector('.fb-message-list')?.contains(question)).toBe(true);
    expect(composer(container)?.hidden).toBe(false);
  });

  it('keeps a waiting tool call without a renderer inline', () => {
    state.messages = [message, questionMessage('input-available')];

    const { container } = render(<Chat agent="support" />);

    expect(container.querySelector('.fb-chat__dock')).toBeNull();
    expect(container.querySelector('.fb-message-list [data-part="tool"]')).toBeTruthy();
    expect(composer(container)?.hidden).toBe(false);
  });

  it('keeps a call left waiting by a stopped turn inline', () => {
    state.status = 'streaming';
    state.toolRenderers = [{ kind: 'question', render: Question }];
    state.messages = [message, questionMessage('input-available')];

    const { container, rerender } = render(<Chat {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    state.status = 'ready';
    rerender(<Chat {...props} />);

    expect(container.querySelector('.fb-chat__dock')).toBeNull();
    expect(composer(container)?.hidden).toBe(false);
  });

  it('keeps a call left waiting by a failed turn inline', () => {
    state.status = 'error';
    state.error = new Error('Turn failed');
    state.toolRenderers = [{ kind: 'question', render: Question }];
    state.messages = [message, questionMessage('input-available')];

    const { container } = render(<Chat {...props} />);

    expect(container.querySelector('.fb-chat__dock')).toBeNull();
    expect(composer(container)?.hidden).toBe(false);
  });
});

describe('Chat composer parts', () => {
  const pricing = { source: 'pages', id: 'pricing', label: 'Pricing page' };
  const mention = { ...pricing, start: 4, end: 17 };

  const mentioned: UIMessage = {
    id: 'user-mention',
    role: 'user',
    parts: [
      { type: 'text', text: 'Ask @Pricing page' },
      { type: 'data-mention', data: mention },
    ],
  };

  beforeEach(() => {
    state.status = 'ready';
    state.error = undefined;
    state.messages = [];
    state.commands = [];
    state.sendMessage.mockReset();
    state.history = { messages: [], queued: [], loadedChatId: undefined, loading: false };
    state.agents = [];
    state.toolRenderers = [];
    setAdapter();
  });

  it('sends attachments, then the text, then one data-mention part per chip', async () => {
    render(<Chat agent="support" />);

    paste({ getData: () => 'p'.repeat(651) });
    type('Ask ');
    insertMention(pricing);
    press('Enter');

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledOnce());

    expect(state.sendMessage.mock.calls[0][0].parts).toEqual([
      { type: 'data-paste', data: { text: 'p'.repeat(651), filename: expect.any(String) } },
      { type: 'text', text: 'Ask @Pricing page' },
      { type: 'data-mention', data: mention },
    ]);
  });

  it('restores the prompt when metadata fails before the message is sent', async () => {
    const onError = vi.fn();

    state.buildMetadata.mockImplementationOnce(() => {
      throw new Error('No page');
    });

    render(<Chat agent="support" onError={onError} />);

    paste({ getData: () => 'p'.repeat(651) });
    type('Hello');
    press('Enter');

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(onError.mock.calls[0][0].message).toBe('No page');
    expect(screen.getByRole('alert').textContent).not.toContain('Command failed');
    expect(state.sendMessage).not.toHaveBeenCalled();

    await waitFor(() => expect(composerText()).toBe('Hello'));

    expect(screen.getByRole('group', { name: 'Pasted text, PASTED, ready' })).toBeTruthy();
  });

  it('does not restore the prompt when sendMessage rejects after taking it', async () => {
    const onError = vi.fn();

    state.sendMessage.mockRejectedValueOnce(new Error('Panel closed'));

    render(<Chat agent="support" onError={onError} />);

    paste({ getData: () => 'p'.repeat(651) });
    type('Hello');
    press('Enter');

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(onError.mock.calls[0][0].message).toBe('Panel closed');
    expect(state.sendMessage).toHaveBeenCalledOnce();

    await waitFor(() => expect(composerText()).toBe(''));

    expect(screen.queryByTestId('attachment-card')).toBeNull();
  });

  it('shows the @label and hides the data-mention part', () => {
    state.messages = [mentioned];

    const { container } = render(<Chat agent="support" />);

    expect(screen.getByText('Ask @Pricing page')).toBeTruthy();
    expect(container.querySelector('[data-part="unknown"]')).toBeNull();
    expect(container.querySelector('.fb-data-part')).toBeNull();
  });

  it('shows "Command failed" when a command rejects', async () => {
    const onError = vi.fn();

    state.commands = [
      {
        id: 'model',
        title: 'Pick a model',
        arguments: true,
        execute: () => Promise.reject(new Error('No such model')),
      },
    ];

    render(<Chat agent="support" onError={onError} />);

    type('/model nope');
    press('Enter');

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(onError.mock.calls[0][0].message).toBe('Command failed: No such model');
    expect(screen.getByRole('alert').textContent).toContain('Command failed: No such model');
    expect(state.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps the chip when a sent message is edited', async () => {
    state.messages = [mentioned];

    render(<Chat agent="support" />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const input = screen.getByRole('textbox', { name: 'Edit message' });

    expect(input.querySelector('.fb-composer-mention')?.textContent).toBe('@Pricing page');

    type(' now', input);
    fireEvent.click(within(input.closest('form')!).getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledOnce());

    expect(state.sendMessage.mock.calls[0][0]).toMatchObject({
      messageId: 'user-mention',
      parts: [
        { type: 'text', text: 'Ask @Pricing page now' },
        { type: 'data-mention', data: mention },
      ],
    });
  });
});

describe('Chat onBeforeSubmit', () => {
  beforeEach(() => {
    state.status = 'ready';
    state.error = undefined;
    state.messages = [];
    state.sendMessage.mockReset();
    state.history = { messages: [], queued: [], loadedChatId: undefined, loading: false };
    state.agents = [];
    state.toolRenderers = [];
    setAdapter();
  });

  function send(text: string) {
    paste({ getData: () => 'p'.repeat(651) });
    type(text);
    press('Enter');
  }

  it.each([
    ['synchronously', () => true],
    ['asynchronously', () => Promise.resolve(true)],
  ])(
    'sends nothing, clears the text and keeps attachments when handled %s',
    async (_name, handle) => {
      const onBeforeSubmit = vi.fn(handle);

      render(<Chat agent="support" onBeforeSubmit={onBeforeSubmit} />);

      send('/model sonnet');

      await waitFor(() =>
        expect(onBeforeSubmit).toHaveBeenCalledWith({
          text: '/model sonnet',
          mentions: [],
          attachments: [
            { type: 'paste', text: 'p'.repeat(651), filename: expect.any(String) as string },
          ],
        }),
      );

      await waitFor(() => expect(composerText()).toBe(''));

      expect(state.sendMessage).not.toHaveBeenCalled();
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    },
  );

  it('sends the message when not handled', async () => {
    render(<Chat agent="support" onBeforeSubmit={() => false} />);

    send('Hello');

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledOnce());

    expect(state.sendMessage.mock.calls[0][0].parts.at(-1)).toEqual({
      type: 'text',
      text: 'Hello',
    });

    await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(0));
  });

  it('sends nothing and reports the error when the hook rejects', async () => {
    const onError = vi.fn();

    render(
      <Chat
        agent="support"
        onError={onError}
        onBeforeSubmit={() => Promise.reject(new Error('Unknown command'))}
      />,
    );

    send('/nope');

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(onError.mock.calls[0][0].message).toBe('Command failed: Unknown command');
    expect(screen.getByRole('alert').textContent).toContain('Command failed: Unknown command');
    expect(state.sendMessage).not.toHaveBeenCalled();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});

function turnRequestError(code: string) {
  return new APICallError({
    message: 'Request failed',
    url: '/api/agents/support',
    requestBodyValues: undefined,
    statusCode: 409,
    responseBody: JSON.stringify({ error: 'The selected model is unavailable.', code }),
  });
}

describe('Chat queue', () => {
  beforeEach(() => {
    state.status = 'streaming';
    state.error = undefined;
    state.messages = [];
    state.commands = [];
    state.dataRenderers = [];
    state.sendMessage.mockReset();
    state.stop.mockReset();
    state.history = { messages: [], queued: [], loadedChatId: undefined, loading: false };
    state.agents = [];
    state.toolRenderers = [];
    setAdapter();
  });

  function deferred() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((done, fail) => {
      resolve = done;
      reject = fail;
    });

    return { promise, resolve, reject };
  }

  function rows() {
    return [...document.querySelectorAll('[aria-label="Queued messages"] li')].map(
      (row) =>
        `${row.querySelector('.fb-chat__queued-label')?.textContent} ${row.querySelector('.fb-chat__queued-text')?.textContent}`,
    );
  }

  function row(text: string) {
    const match = [
      ...document.querySelectorAll<HTMLElement>('[aria-label="Queued messages"] li'),
    ].find((candidate) => candidate.querySelector('.fb-chat__queued-text')?.textContent === text);

    if (!match) throw new Error(`No queued row ${text}`);

    return within(match);
  }

  async function queue(text: string) {
    type(text);
    press('Enter');

    await waitFor(() => expect(composerText()).toBe(''));
  }

  const sentText = (call: number) =>
    (state.sendMessage.mock.calls[call]?.[0] as { parts: UIMessage['parts'] }).parts.at(-1);

  it('queues sends mid-turn and runs them one at a time after a normal end', async () => {
    const first = deferred();
    const { rerender } = render(<Chat {...props} />);

    await queue('One');
    await queue('Two');
    await queue('Three');

    expect(rows()).toEqual(['Queued One', 'Queued Two', 'Queued Three']);
    expect(state.sendMessage).not.toHaveBeenCalled();

    state.sendMessage.mockReturnValueOnce(first.promise);
    state.status = 'ready';
    rerender(<Chat {...props} />);

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledOnce());

    expect(sentText(0)).toEqual({ type: 'text', text: 'One' });
    expect(state.sendMessage.mock.calls[0]?.[0]).toMatchObject({ metadata: { source: 'ui' } });
    expect(rows()).toEqual(['Queued Two', 'Queued Three']);

    await act(() => {
      first.resolve();

      return first.promise;
    });

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledTimes(3));

    expect(sentText(1)).toEqual({ type: 'text', text: 'Two' });
    expect(sentText(2)).toEqual({ type: 'text', text: 'Three' });
    expect(rows()).toEqual([]);
  });

  it('pauses on Stop, sends a new prompt first, and runs a paused one on Send now', async () => {
    const { rerender } = render(<Chat {...props} />);

    await queue('Later');

    expect(row('Later').queryByRole('button', { name: 'Send now' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(state.stop).toHaveBeenCalledOnce();
    expect(rows()).toEqual(['Paused Later']);

    state.status = 'ready';
    rerender(<Chat {...props} />);

    await act(() => Promise.resolve());

    expect(state.sendMessage).not.toHaveBeenCalled();

    type('Fresh');
    press('Enter');

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledOnce());

    expect(sentText(0)).toEqual({ type: 'text', text: 'Fresh' });
    expect(rows()).toEqual(['Paused Later']);

    fireEvent.click(row('Later').getByRole('button', { name: 'Send now' }));

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledTimes(2));

    expect(sentText(1)).toEqual({ type: 'text', text: 'Later' });
    expect(rows()).toEqual([]);
  });

  it('pauses when the turn fails', async () => {
    const { rerender } = render(<Chat {...props} />);

    await queue('Later');

    act(() => state.options?.onError?.(new Error('Stream failed')));
    state.status = 'error';
    rerender(<Chat {...props} />);

    await act(() => Promise.resolve());

    expect(rows()).toEqual(['Paused Later']);
    expect(state.sendMessage).not.toHaveBeenCalled();

    fireEvent.click(row('Later').getByRole('button', { name: 'Send now' }));

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledOnce());
  });

  it('holds the queue while a docked question waits, then runs it', async () => {
    state.toolRenderers = [{ kind: 'question', render: Question }];

    const { container, rerender } = render(<Chat {...props} />);

    await queue('Later');

    state.status = 'ready';
    state.messages = [message, questionMessage('input-available')];
    rerender(<Chat {...props} />);

    await act(() => Promise.resolve());

    expect(composer(container)?.hidden).toBe(true);
    expect(state.sendMessage).not.toHaveBeenCalled();

    state.messages = [message, questionMessage('output-available')];
    rerender(<Chat {...props} />);

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledOnce());
  });

  it('removes an entry, and edits one back into an empty composer only', async () => {
    const { rerender } = render(<Chat {...props} />);

    await queue('One');
    await queue('Two');

    fireEvent.click(row('One').getByRole('button', { name: 'Remove' }));

    expect(rows()).toEqual(['Queued Two']);

    type('Draft');

    await waitFor(() =>
      expect(row('Two').getByRole<HTMLButtonElement>('button', { name: 'Edit' }).disabled).toBe(
        true,
      ),
    );

    press('Enter');

    await waitFor(() => expect(composerText()).toBe(''));

    await waitFor(() =>
      expect(row('Two').getByRole<HTMLButtonElement>('button', { name: 'Edit' }).disabled).toBe(
        false,
      ),
    );

    fireEvent.click(row('Two').getByRole('button', { name: 'Edit' }));

    await waitFor(() => expect(composerText()).toBe('Two'));

    expect(rows()).toEqual(['Queued Draft']);

    state.status = 'ready';
    rerender(<Chat {...props} />);

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledOnce());

    expect(sentText(0)).toEqual({ type: 'text', text: 'Draft' });
  });

  it('keeps a chat’s entries, paused, across a chat switch', async () => {
    render(<Chat {...props} defaultChatId="one" />);

    await queue('Later');

    fireEvent.click(screen.getByText('Untitled'));

    expect(rows()).toEqual([]);

    fireEvent.click(screen.getByText('One'));

    expect(rows()).toEqual(['Paused Later']);
  });

  it('queues a queue command as its / text, and pauses when it rejects', async () => {
    const review = vi.fn(() => Promise.reject(new Error('No reviewer')));

    state.commands = [
      { id: 'review', title: 'Review', arguments: true, queue: true, execute: review },
      { id: 'plan', title: 'Plan', arguments: true, execute: vi.fn() },
    ];

    const { rerender } = render(<Chat {...props} />);

    await queue('/review the footer');
    await queue('/plan on');
    await queue('After');

    expect(rows()).toEqual(['Queued /review the footer', 'Queued After']);
    expect(state.commands[1]?.execute).toHaveBeenCalledWith('on');

    state.status = 'ready';
    rerender(<Chat {...props} />);

    await waitFor(() => expect(review).toHaveBeenCalledWith('the footer'));
    await waitFor(() => expect(rows()).toEqual(['Paused After']));

    expect(screen.getByRole('alert').textContent).toContain('Command failed: No reviewer');
    expect(state.sendMessage).not.toHaveBeenCalled();
  });

  it('offers Steer only when the adapter can steer', async () => {
    render(<Chat {...props} defaultChatId="one" />);

    await queue('Later');

    expect(row('Later').queryByRole('button', { name: 'Steer' })).toBeNull();
    expect(row('Later').getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('steers an entry into the turn and drops it when the reply takes it', async () => {
    const steerMessage = vi.fn((_chatId: unknown, _message: UIMessage) => Promise.resolve());

    state.adapter = { ...state.adapter, steerMessage };

    render(<Chat {...props} defaultChatId="one" />);

    await queue('Skip the footer');
    await queue('Then this');

    fireEvent.click(row('Skip the footer').getByRole('button', { name: 'Steer' }));

    await waitFor(() => expect(steerMessage).toHaveBeenCalledOnce());

    const [chatId, steered] = steerMessage.mock.calls[0] ?? [];

    expect(chatId).toBe('one');
    expect(steered).toEqual({
      id: expect.any(String),
      role: 'user',
      parts: [{ type: 'text', text: 'Skip the footer' }],
      metadata: { source: 'ui' },
    });
    expect(rows()).toEqual(['Steering Skip the footer', 'Queued Then this']);
    expect(row('Skip the footer').queryByRole('button', { name: 'Remove' })).toBeNull();

    act(() =>
      state.options?.onData?.({
        type: 'data-steered',
        id: steered?.id,
        data: { messageId: steered?.id, text: 'Skip the footer' },
      }),
    );

    expect(rows()).toEqual(['Queued Then this']);
  });

  it('leaves a steer the turn did not reach to the backend', async () => {
    const steerMessage = vi.fn(() => Promise.resolve());

    state.adapter = { ...state.adapter, steerMessage };

    const { rerender } = render(<Chat {...props} defaultChatId="one" />);

    await queue('Skip the footer');

    fireEvent.click(row('Skip the footer').getByRole('button', { name: 'Steer' }));

    await waitFor(() => expect(steerMessage).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    act(() =>
      state.options?.onFinish?.({
        message,
        messages: [message],
        isAbort: true,
        isDisconnect: false,
        isError: false,
      }),
    );

    state.status = 'ready';
    rerender(<Chat {...props} defaultChatId="one" />);

    await act(() => Promise.resolve());

    expect(rows()).toEqual([]);
    expect(state.sendMessage).not.toHaveBeenCalled();
  });

  it('reports a failed steer and keeps the entry queued', async () => {
    const onError = vi.fn();

    state.adapter = {
      ...state.adapter,
      steerMessage: () => Promise.reject(new Error('Panel closed')),
    };

    render(<Chat {...props} defaultChatId="one" onError={onError} />);

    await queue('Skip the footer');

    fireEvent.click(row('Skip the footer').getByRole('button', { name: 'Steer' }));

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());

    expect(onError.mock.calls[0]?.[0].message).toBe('Panel closed');
    expect(rows()).toEqual(['Queued Skip the footer']);
  });

  it('renders a steered message inside the reply, where the reply took it', () => {
    state.status = 'ready';
    state.dataRenderers = [{ kind: 'steered', render: SteeredPart }];

    state.messages = [
      message,
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Reading the page' },
          { type: 'data-steered', id: 's1', data: { messageId: 's1', text: 'Skip the footer' } },
          { type: 'data-steered', id: 's2', data: { messageId: 's2' } },
          { type: 'text', text: 'Done' },
        ],
      },
    ];

    const { container } = render(<Chat {...props} />);

    const reply = container.querySelectorAll('.fb-message')[1] as HTMLElement;
    const steered = reply.querySelector('[data-part="steered"]') as HTMLElement;

    expect(steered.textContent).toBe('Skip the footer');
    expect(screen.getByText('Reading the page').compareDocumentPosition(steered)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(steered.compareDocumentPosition(screen.getByText('Done'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(reply.querySelector('.fb-data-part')?.textContent).toContain('"messageId": "s2"');
  });

  function captureChatId() {
    const created: { report?: (chatId: string) => void } = {};
    const { createTransport } = state.adapter;

    state.adapter = {
      ...state.adapter,
      createTransport: (options) => {
        created.report = options.onChatId;

        return createTransport(options);
      },
    };

    return created;
  }

  const finish = (end: { isAbort?: boolean; isError?: boolean } = {}) =>
    act(() =>
      state.options?.onFinish?.({
        message,
        messages: [message],
        isAbort: end.isAbort ?? false,
        isDisconnect: false,
        isError: end.isError ?? false,
      }),
    );

  it('runs an entry queued in a new chat once the first reply creates the chat', async () => {
    const created = captureChatId();
    const { rerender } = render(<Chat {...props} />);

    await queue('Later');

    act(() => created.report?.('c9'));
    finish();
    state.status = 'ready';
    rerender(<Chat {...props} />);

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledOnce());

    expect(sentText(0)).toEqual({ type: 'text', text: 'Later' });
    expect(rows()).toEqual([]);
  });

  it('runs an entry queued in a new controlled chat once the host takes the new id', async () => {
    const created = captureChatId();
    const onChatIdChange = vi.fn();
    const { rerender } = render(
      <Chat {...props} chatId={undefined} onChatIdChange={onChatIdChange} />,
    );

    await queue('Later');

    act(() => created.report?.('c9'));
    finish();

    expect(onChatIdChange).toHaveBeenCalledWith('c9');

    state.status = 'ready';
    rerender(<Chat {...props} chatId="c9" onChatIdChange={onChatIdChange} />);

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledOnce());

    expect(sentText(0)).toEqual({ type: 'text', text: 'Later' });
  });

  it('drops a new chat’s entries when the user leaves it before it exists', async () => {
    render(<Chat {...props} />);

    await queue('Later');

    fireEvent.click(screen.getByText('One'));

    expect(rows()).toEqual([]);
    expect(state.sendMessage).not.toHaveBeenCalled();
  });

  it('runs nothing after Stop even when the turn ends normally after it', async () => {
    const { rerender } = render(<Chat {...props} defaultChatId="one" />);

    await queue('Later');

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    finish();
    state.status = 'ready';
    rerender(<Chat {...props} defaultChatId="one" />);

    await act(() => Promise.resolve());

    expect(state.sendMessage).not.toHaveBeenCalled();
    expect(rows()).toEqual(['Paused Later']);
  });

  it('keeps Edit off while the composer holds only a mention', async () => {
    render(<Chat {...props} defaultChatId="one" />);

    await queue('Later');

    insertMention({ id: 'doc-1', label: 'Pricing', source: 'docs' });

    await waitFor(() =>
      expect(row('Later').getByRole<HTMLButtonElement>('button', { name: 'Edit' }).disabled).toBe(
        true,
      ),
    );
  });

  it('holds the queue while a client tool’s output sends the next step', async () => {
    state.executeClientTool.mockResolvedValue({ ok: true });

    const { rerender } = render(<Chat {...props} defaultChatId="one" />);

    await queue('Later');

    await act(async () => {
      await state.options?.onToolCall?.({
        toolCall: { dynamic: true, toolName: 'page', toolCallId: 't1', input: {} },
      });
    });

    state.status = 'ready';
    rerender(<Chat {...props} defaultChatId="one" />);

    await act(() => Promise.resolve());

    expect(state.addToolOutput).toHaveBeenCalledOnce();
    expect(state.sendMessage).not.toHaveBeenCalled();
    expect(rows()).toEqual(['Queued Later']);
  });

  it('runs entries in order after Send now on a later one', async () => {
    const first = deferred();
    const { rerender } = render(<Chat {...props} defaultChatId="one" />);

    await queue('One');
    await queue('Two');

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    state.status = 'ready';
    rerender(<Chat {...props} defaultChatId="one" />);

    state.sendMessage.mockReturnValueOnce(first.promise);
    fireEvent.click(row('Two').getByRole('button', { name: 'Send now' }));

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledOnce());

    expect(sentText(0)).toEqual({ type: 'text', text: 'Two' });
    expect(rows()).toEqual(['Queued One']);

    await act(() => {
      first.resolve();

      return first.promise;
    });

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledTimes(2));

    expect(sentText(1)).toEqual({ type: 'text', text: 'One' });
  });

  it('runs an entry queued while a stopped turn winds down, and keeps the earlier one paused', async () => {
    const { rerender } = render(<Chat {...props} defaultChatId="one" />);

    await queue('Later');

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    await queue('Fresh');

    finish({ isAbort: true });

    expect(rows()).toEqual(['Paused Later', 'Queued Fresh']);

    state.status = 'ready';
    rerender(<Chat {...props} defaultChatId="one" />);

    await waitFor(() => expect(state.sendMessage).toHaveBeenCalledOnce());

    expect(sentText(0)).toEqual({ type: 'text', text: 'Fresh' });
    expect(rows()).toEqual(['Paused Later']);
  });

  it('pauses every entry when a turn aborts without Stop', async () => {
    render(<Chat {...props} defaultChatId="one" />);

    await queue('Later');

    finish({ isAbort: true });

    expect(rows()).toEqual(['Paused Later']);
  });

  it('puts a message back, paused, when building its metadata fails', async () => {
    const { rerender } = render(<Chat {...props} defaultChatId="one" />);

    await queue('One');
    await queue('Two');

    state.buildMetadata.mockImplementationOnce(() => {
      throw new Error('No page');
    });

    state.status = 'ready';
    rerender(<Chat {...props} defaultChatId="one" />);

    await waitFor(() => expect(rows()).toEqual(['Paused One', 'Paused Two']));

    expect(state.sendMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('No page');
  });
});
