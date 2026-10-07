import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ManifestEntry = {
  slug: string;
  label: string;
  source: 'config';
  defaultModel: string;
  models: string[];
  names?: Partial<Record<string, string>>;
  reasoning?: Record<string, { key: string; label: string }[]>;
};

const gptLevels = [
  { key: 'low', label: 'Low' },
  { key: 'high', label: 'High' },
];

const opusLevels = [
  { key: 'high', label: 'High · 16k' },
  { key: 'max', label: 'Max · 32k' },
];

const mocks = vi.hoisted(() => ({
  chat: vi.fn(({ composerStartSlot }: { composerStartSlot?: ReactNode }) => composerStartSlot),
  getEntityConfig: vi.fn(() => ({ labels: { plural: { en: 'Chats', de: 'Unterhaltungen' } } })),
  getPreference: vi.fn(),
  mountChat: vi.fn(),
  manifest: { defaultAgent: 'general', agents: [] as unknown[] },
  pathname: '/admin/collections/conversations/create',
  provider: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  request: vi.fn(),
  setPreference: vi.fn(),
  setStepNav: vi.fn(),
  startRouteTransition: vi.fn((transition: () => void) => transition()),
  toastError: vi.fn(),
}));

vi.mock('@payloadcms/ui', () => ({
  toast: { error: mocks.toastError },
  useConfig: () => ({ getEntityConfig: mocks.getEntityConfig }),
  usePreferences: () => ({
    getPreference: mocks.getPreference,
    setPreference: mocks.setPreference,
  }),
  useRouteTransition: () => ({ startRouteTransition: mocks.startRouteTransition }),
  useStepNav: () => ({ setStepNav: mocks.setStepNav }),
  useTranslation: () => ({ i18n: { language: 'en' } }),
}));

vi.mock('next/navigation.js', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock('@frogbotai/ui/chat', async () => {
  const { ModelSelector } = await import('../../../../packages/ui/src/chat/model-selector.js');
  const { useChatDocument } = await import('../../../../packages/ui/src/chat/use-chats.js');
  const sdk = { request: mocks.request };
  const manifest = { chat: { enabled: true, chatsSlug: 'conversations' } };

  return {
    AgentSelector: ({ onAgentChange }: { onAgentChange: (agent: string) => void }) => (
      <button onClick={() => onAgentChange('sales')}>Sales</button>
    ),
    Chat: mocks.chat,
    ChatProvider: (props: { children: ReactNode; toolRenderers?: unknown }) => {
      mocks.provider(props);

      return props.children;
    },
    cookieFetch: () => vi.fn(),
    ModelSelector,
    useChatDocument,
    useChatProvider: () => ({ agentManifest: mocks.manifest, loading: false, manifest, sdk }),
  };
});

const { ChatViewClient } = await import('../../../../packages/next/src/exports/ChatView.client.js');
const { MessagePart } = await import('../../../../packages/ui/src/chat/message-part.js');
const { CHAT_MUTATION_EVENT } = await import('../../../../packages/ui/src/chat/use-chats.js');

const chatsCrumb = { label: 'Chats', url: '/admin/collections/conversations' };
const createPath = '/admin/collections/conversations/create';

function agentEntry(slug: string, overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    slug,
    label: slug,
    source: 'config',
    defaultModel: 'openai/test',
    models: ['openai/test'],
    ...overrides,
  };
}

const reasoningAgent = agentEntry('general', {
  defaultModel: 'openai/gpt-5',
  models: ['openai/gpt-5', 'anthropic/opus', 'openai/gpt-4o'],
  reasoning: { 'openai/gpt-5': gptLevels, 'anthropic/opus': opusLevels },
});

function useManifest(...agents: ManifestEntry[]) {
  mocks.manifest = { defaultAgent: agents[0].slug, agents };
}

function MountedChat(props: { composerStartSlot?: ReactNode }) {
  useEffect(() => {
    mocks.mountChat();
  }, []);

  return mocks.chat(props);
}

function renderChatView(props: Partial<Parameters<typeof ChatViewClient>[0]> = {}) {
  const view = () => (
    <ChatViewClient
      agent="general"
      documentPath="/admin/collections/conversations"
      initialMessages={[]}
      {...props}
    />
  );

  const rendered = render(view());

  const moveTo = (pathname: string) => {
    mocks.pathname = pathname;
    rendered.rerender(view());
  };

  return { ...rendered, moveTo };
}

function lastChatProps() {
  return mocks.chat.mock.calls.at(-1)?.[0] as { model?: string; reasoning?: string };
}

function lastStepNav() {
  return mocks.setStepNav.mock.calls.at(-1)?.[0];
}

function reportChatId(chatId: string | undefined) {
  const props = mocks.chat.mock.calls.at(-1)![0] as unknown as {
    onChatIdChange: (id: string | undefined) => void;
  };

  act(() => props.onChatIdChange(chatId));
}

function serveChat(chat: { id: string; title?: string }) {
  mocks.request.mockImplementation(() =>
    Promise.resolve(Response.json({ agent: 'general', ...chat })),
  );
}

function trigger() {
  return screen.findByRole('button', { expanded: false });
}

async function chooseModel(name: string) {
  const user = userEvent.setup();

  await user.click(await trigger());
  await user.click(screen.getByRole('button', { name: /change model$/ }));
  await user.click(screen.getByRole('button', { name }));
  await user.keyboard('{Escape}');
}

describe('ChatViewClient', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));

    mocks.chat.mockClear();
    mocks.mountChat.mockClear();
    mocks.provider.mockClear();
    mocks.pathname = createPath;
    mocks.push.mockClear();
    mocks.refresh.mockClear();
    mocks.request.mockReset();
    mocks.setPreference.mockClear();
    mocks.setStepNav.mockClear();
    mocks.startRouteTransition.mockClear();
    mocks.toastError.mockClear();
    mocks.getPreference.mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders chat code blocks without a FrogBot theme wrapper', async () => {
    useManifest(agentEntry('general'));

    const { container } = renderChatView({
      ChatComponent: () => (
        <MessagePart
          role="user"
          part={{ type: 'text', text: '```js\nconst x = 1\n```', state: 'done' }}
        />
      ),
    });

    expect(await screen.findByText('const x = 1')).toBeTruthy();
    expect(container.querySelector('.fb-code-block--user')).not.toBeNull();
    expect(container.querySelector('.fb-theme')).toBeNull();
    expect(document.documentElement.dataset.fbTheme).toBeUndefined();
  });

  it('moves the URL to the first reported chat through the history Next syncs', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');

    useManifest(agentEntry('general'));
    renderChatView();

    await waitFor(() => expect(mocks.chat).toHaveBeenCalled());

    expect(lastChatProps()).not.toHaveProperty('chatId');

    reportChatId('chat/1');
    reportChatId('chat/1');

    expect(replaceState).toHaveBeenCalledExactlyOnceWith(
      null,
      '',
      '/admin/collections/conversations/chat%2F1',
    );
    expect(mocks.startRouteTransition).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('navigates to a different chat reported after the new chat moved to its thread', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');

    useManifest(agentEntry('general'));
    renderChatView();

    await waitFor(() => expect(mocks.chat).toHaveBeenCalled());

    reportChatId('chat-1');
    reportChatId('chat-2');

    expect(replaceState).toHaveBeenCalledOnce();
    expect(mocks.startRouteTransition).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith('/admin/collections/conversations/chat-2');
  });

  it('starts an empty chat when the route leaves the thread a new chat moved to', async () => {
    useManifest(agentEntry('general'));
    serveChat({ id: 'chat-2', title: 'Plan the launch' });

    const { moveTo } = renderChatView({ ChatComponent: MountedChat });

    await waitFor(() => expect(mocks.mountChat).toHaveBeenCalledOnce());

    reportChatId('chat-2');
    moveTo('/admin/collections/conversations/chat-2');

    await waitFor(() => expect(lastStepNav()).toEqual([chatsCrumb, { label: 'Plan the launch' }]));

    expect(mocks.mountChat).toHaveBeenCalledOnce();

    moveTo(createPath);

    await waitFor(() => expect(mocks.mountChat).toHaveBeenCalledTimes(2));

    expect(lastChatProps()).not.toHaveProperty('chatId');
    expect(lastStepNav()).toEqual([]);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('labels the thread again after the route syncs to it', async () => {
    useManifest(agentEntry('general'));
    serveChat({ id: 'chat-2', title: 'Plan the launch' });

    const { moveTo } = renderChatView();

    await waitFor(() => expect(mocks.chat).toHaveBeenCalled());

    reportChatId('chat-2');

    await waitFor(() => expect(lastStepNav()).toEqual([chatsCrumb, { label: 'Plan the launch' }]));

    mocks.setStepNav.mockClear();
    moveTo('/admin/collections/conversations/chat-2');

    await waitFor(() => expect(lastStepNav()).toEqual([chatsCrumb, { label: 'Plan the launch' }]));
  });

  it('refreshes a thread URL that history restores without its chat', async () => {
    useManifest(agentEntry('general'));
    mocks.pathname = '/admin/collections/conversations/chat-9';

    renderChatView();

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());

    expect(mocks.startRouteTransition).toHaveBeenCalledOnce();
  });

  it('passes the tool renderers of the selected agent to the chat provider', async () => {
    useManifest(agentEntry('general'), agentEntry('sales'));

    const general = [{ kind: 'lookup', render: () => null }];
    const sales = [{ kind: 'lookup', render: () => null }];

    renderChatView({ toolRenderersByAgent: { general, sales } });

    await waitFor(() => expect(mocks.provider.mock.calls.at(-1)?.[0].toolRenderers).toBe(general));

    fireEvent.click(await screen.findByText('Sales'));

    await waitFor(() => expect(mocks.provider.mock.calls.at(-1)?.[0].toolRenderers).toBe(sales));
  });

  it('shows failed turns as an admin toast instead of an inline error', async () => {
    useManifest(agentEntry('general'));

    renderChatView();
    await waitFor(() => expect(mocks.chat).toHaveBeenCalled());

    const props = mocks.chat.mock.calls.at(-1)?.[0] as {
      errorContent?: unknown;
      onError: (error: Error) => void;
    };

    props.onError(new Error('The AI provider rejected the API key.'));

    expect(props.errorContent).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledWith('The AI provider rejected the API key.');
  });

  it('shows the model selector for a single-model agent with reasoning levels', async () => {
    useManifest(
      agentEntry('general', {
        defaultModel: 'openai/gpt-5',
        models: ['openai/gpt-5'],
        reasoning: { 'openai/gpt-5': gptLevels },
      }),
    );

    renderChatView();

    expect((await trigger()).textContent).toBe('gpt-5 · Default');
  });

  it('hides the model selector for a single-model agent without reasoning levels', async () => {
    useManifest(agentEntry('general'));

    renderChatView();

    await waitFor(() => expect(mocks.chat).toHaveBeenCalled());

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('passes manifest names and ID suffix fallbacks to the model selector', async () => {
    const user = userEvent.setup();

    useManifest(
      agentEntry('general', {
        defaultModel: 'bedrock/us.amazon.nova-micro-v1:0',
        models: [
          'bedrock/us.amazon.nova-micro-v1:0',
          'bedrock/anthropic.claude-3-haiku-20240307-v1:0',
          'my-local/plain',
          'smart',
        ],
        names: { 'bedrock/us.amazon.nova-micro-v1:0': 'Nova Micro (US)' },
      }),
    );

    renderChatView();

    expect((await trigger()).textContent).toBe('Nova Micro (US)');

    await user.click(await trigger());

    const list = within(screen.getByRole('dialog'));

    expect(list.getByRole('button', { name: 'Nova Micro (US)' })).toBeTruthy();
    expect(list.getByRole('button', { name: 'plain' })).toBeTruthy();
    expect(list.getByRole('button', { name: 'smart' })).toBeTruthy();
    expect(
      list.getByRole('button', { name: 'anthropic.claude-3-haiku-20240307-v1:0' }),
    ).toBeTruthy();
    expect(
      [...document.querySelectorAll('.fb-model-selector__option-name')].map(
        (name) => name.textContent,
      ),
    ).toEqual(['Nova Micro (US)', 'anthropic.claude-3-haiku-20240307-v1:0', 'plain', 'smart']);
  });

  it('starts a new chat from the saved model and its remembered level', async () => {
    useManifest(reasoningAgent);

    mocks.getPreference.mockResolvedValue({
      agent: 'general',
      model: 'anthropic/opus',
      reasoning: { 'anthropic/opus': 'max' },
    });

    renderChatView();

    expect((await trigger()).textContent).toBe('opus · Max · 32k');
    expect(lastChatProps()).toMatchObject({ model: 'anthropic/opus', reasoning: 'max' });
  });

  it('restores the remembered level of the model the user switches to', async () => {
    useManifest(reasoningAgent);

    mocks.getPreference.mockResolvedValue({
      agent: 'general',
      model: 'openai/gpt-5',
      reasoning: { 'openai/gpt-5': 'low', 'anthropic/opus': 'max' },
    });

    renderChatView();

    await chooseModel('opus');

    expect((await trigger()).textContent).toBe('opus · Max · 32k');
    expect(lastChatProps()).toMatchObject({ model: 'anthropic/opus', reasoning: 'max' });
  });

  it('shows Default after switching to a model without a remembered level', async () => {
    useManifest(reasoningAgent);

    mocks.getPreference.mockResolvedValue({
      agent: 'general',
      model: 'openai/gpt-5',
      reasoning: { 'openai/gpt-5': 'high' },
    });

    renderChatView();

    await chooseModel('opus');

    expect((await trigger()).textContent).toBe('opus · Default');
    expect(lastChatProps().reasoning).toBeUndefined();
  });

  it('drops a remembered level the model no longer offers', async () => {
    useManifest(reasoningAgent);

    mocks.getPreference.mockResolvedValue({
      agent: 'general',
      model: 'openai/gpt-5',
      reasoning: { 'openai/gpt-5': 'xhigh' },
    });

    renderChatView();

    expect((await trigger()).textContent).toBe('gpt-5 · Default');
    expect(lastChatProps()).toMatchObject({ model: 'openai/gpt-5' });
    expect(lastChatProps().reasoning).toBeUndefined();
  });

  it('remembers a level chosen with the slider for the active model only', async () => {
    const user = userEvent.setup();

    useManifest(reasoningAgent);

    mocks.getPreference.mockResolvedValue({
      agent: 'general',
      model: 'openai/gpt-5',
      reasoning: { 'anthropic/opus': 'max' },
    });

    renderChatView();

    await user.click(await trigger());

    fireEvent.change(screen.getByRole('slider', { name: 'Reasoning' }), {
      target: { value: '2' },
    });

    expect(lastChatProps()).toMatchObject({ model: 'openai/gpt-5', reasoning: 'high' });
    expect(mocks.setPreference).toHaveBeenLastCalledWith('frogbot-chat-picks', {
      agent: 'general',
      model: 'openai/gpt-5',
      reasoning: { 'anthropic/opus': 'max', 'openai/gpt-5': 'high' },
    });
  });

  it('forgets the active model level when the slider returns to Default', async () => {
    const user = userEvent.setup();

    useManifest(reasoningAgent);

    mocks.getPreference.mockResolvedValue({
      agent: 'general',
      model: 'openai/gpt-5',
      reasoning: { 'openai/gpt-5': 'high' },
    });

    renderChatView();

    await user.click(await trigger());

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });

    expect(lastChatProps().reasoning).toBeUndefined();
    expect(mocks.setPreference).toHaveBeenLastCalledWith('frogbot-chat-picks', {
      agent: 'general',
      model: 'openai/gpt-5',
      reasoning: {},
    });
  });

  it('ignores saved preference values that do not parse', async () => {
    useManifest(reasoningAgent);
    mocks.getPreference.mockResolvedValue({ agent: 7, model: ['openai/gpt-5'], reasoning: 'high' });

    renderChatView();

    expect((await trigger()).textContent).toBe('gpt-5 · Default');
    expect(lastChatProps()).toMatchObject({ model: 'openai/gpt-5' });
  });

  it('keeps a saved model from the previous preference shape', async () => {
    useManifest(reasoningAgent);
    mocks.getPreference.mockResolvedValue({ agent: 'general', model: 'anthropic/opus' });

    renderChatView();

    expect((await trigger()).textContent).toBe('opus · Default');
  });

  it('starts an existing chat at its latest message selection before preferences', async () => {
    useManifest(reasoningAgent);

    mocks.getPreference.mockResolvedValue({
      agent: 'general',
      model: 'openai/gpt-5',
      reasoning: { 'openai/gpt-5': 'low', 'anthropic/opus': 'max' },
    });

    renderChatView({
      chatId: 'chat-1',
      initialSelection: { model: 'anthropic/opus', reasoning: 'high' },
    });

    expect((await trigger()).textContent).toBe('opus · High · 16k');
    expect(lastChatProps()).toMatchObject({ model: 'anthropic/opus', reasoning: 'high' });
  });

  it('starts an existing chat at Default when its latest message used Default', async () => {
    useManifest(reasoningAgent);

    mocks.getPreference.mockResolvedValue({
      agent: 'general',
      model: 'openai/gpt-5',
      reasoning: { 'openai/gpt-5': 'high' },
    });

    renderChatView({ chatId: 'chat-1', initialSelection: { model: 'openai/gpt-5' } });

    expect((await trigger()).textContent).toBe('gpt-5 · Default');
    expect(lastChatProps().reasoning).toBeUndefined();
  });

  it('falls back to preferences when the chat selection is no longer allowed', async () => {
    useManifest(reasoningAgent);

    mocks.getPreference.mockResolvedValue({
      agent: 'general',
      model: 'anthropic/opus',
      reasoning: { 'anthropic/opus': 'max' },
    });

    renderChatView({
      chatId: 'chat-1',
      initialSelection: { model: 'openai/retired', reasoning: 'high' },
    });

    expect((await trigger()).textContent).toBe('opus · Max · 32k');
  });

  it('uses the default when narrowing general removes the saved preference model', async () => {
    useManifest(agentEntry('general'));

    mocks.getPreference.mockResolvedValue({
      agent: 'general',
      model: 'anthropic/opus',
      reasoning: { 'anthropic/opus': 'max' },
    });

    renderChatView();

    await waitFor(() => expect(mocks.chat).toHaveBeenCalled());

    expect(lastChatProps()).toMatchObject({ model: 'openai/test' });
    expect(lastChatProps().reasoning).toBeUndefined();
  });

  it('uses the default when narrowing general removes the existing chat selection', async () => {
    useManifest(agentEntry('general'));

    renderChatView({
      chatId: 'chat-1',
      initialSelection: { model: 'anthropic/opus', reasoning: 'max' },
    });

    await waitFor(() => expect(mocks.chat).toHaveBeenCalled());

    expect(lastChatProps()).toMatchObject({ model: 'openai/test' });
    expect(lastChatProps().reasoning).toBeUndefined();
  });

  it('ignores the chat selection when starting a new chat', async () => {
    useManifest(reasoningAgent);

    renderChatView({ initialSelection: { model: 'anthropic/opus', reasoning: 'max' } });

    expect((await trigger()).textContent).toBe('gpt-5 · Default');
  });

  it('navigates to another chat opened from an existing chat', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');

    useManifest(agentEntry('general'));

    const initialChat = { id: 'chat-1', agent: 'general', channel: 'slack', channelLabel: 'Slack' };

    renderChatView({ chatId: 'chat-1', initialChat });

    await waitFor(() => expect(mocks.chat).toHaveBeenCalled());

    const props = mocks.chat.mock.calls.at(-1)![0] as unknown as {
      onChatIdChange: (id: string) => void;
    };

    expect(props).toMatchObject({ chatId: 'chat-1', initialChat });

    props.onChatIdChange('chat-1');

    expect(mocks.push).not.toHaveBeenCalled();

    props.onChatIdChange('chat/2');

    expect(mocks.startRouteTransition).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith('/admin/collections/conversations/chat%2F2');
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('shows only the logo on the chat home', async () => {
    useManifest(agentEntry('general'));

    renderChatView();

    await waitFor(() => expect(mocks.chat).toHaveBeenCalled());

    expect(lastStepNav()).toEqual([]);
  });

  it('labels an existing thread with the chats link and its title', async () => {
    useManifest(agentEntry('general'));

    renderChatView({
      chatId: 'chat-1',
      initialChat: { id: 'chat-1', agent: 'general', title: 'Quarterly plan' },
    });

    await waitFor(() => expect(lastStepNav()).toEqual([chatsCrumb, { label: 'Quarterly plan' }]));

    expect(mocks.getEntityConfig).toHaveBeenCalledWith({ collectionSlug: 'conversations' });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it.each([undefined, '', ' \n\t '])(
    'labels a thread with the blank title %j as Untitled',
    async (title) => {
      useManifest(agentEntry('general'));

      renderChatView({ chatId: 'chat-1', initialChat: { id: 'chat-1', agent: 'general', title } });

      await waitFor(() => expect(lastStepNav()).toEqual([chatsCrumb, { label: 'Untitled' }]));
    },
  );

  it('labels a new chat once its id replaces the create route', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');

    useManifest(agentEntry('general'));
    serveChat({ id: 'chat-2', title: 'Plan the launch' });
    renderChatView();

    await waitFor(() => expect(mocks.chat).toHaveBeenCalled());

    reportChatId('chat-2');

    await waitFor(() => expect(lastStepNav()).toEqual([chatsCrumb, { label: 'Plan the launch' }]));

    expect(replaceState).toHaveBeenCalledWith(null, '', '/admin/collections/conversations/chat-2');
    expect(mocks.request).toHaveBeenCalledWith('/conversations/chat-2?depth=0', undefined);
  });

  it('returns to the logo only when a new chat starts after a thread', async () => {
    useManifest(agentEntry('general'));
    serveChat({ id: 'chat-2', title: 'Plan the launch' });
    renderChatView();

    await waitFor(() => expect(mocks.chat).toHaveBeenCalled());

    reportChatId('chat-2');

    await waitFor(() => expect(lastStepNav()).toHaveLength(2));

    reportChatId(undefined);

    await waitFor(() => expect(lastStepNav()).toEqual([]));
  });

  it('labels the routed thread after the route moves to another chat', async () => {
    useManifest(agentEntry('general'));

    const { rerender } = renderChatView({
      chatId: 'chat-1',
      initialChat: { id: 'chat-1', agent: 'general', title: 'Quarterly plan' },
    });

    await waitFor(() => expect(mocks.chat).toHaveBeenCalled());

    reportChatId(undefined);

    await waitFor(() => expect(lastStepNav()).toEqual([]));

    rerender(
      <ChatViewClient
        agent="general"
        chatId="chat-3"
        documentPath="/admin/collections/conversations"
        initialChat={{ id: 'chat-3', agent: 'general', title: 'Hiring plan' }}
        initialMessages={[]}
      />,
    );

    await waitFor(() => expect(lastStepNav()).toEqual([chatsCrumb, { label: 'Hiring plan' }]));
  });

  it('updates the thread title when a chat mutation is announced', async () => {
    useManifest(agentEntry('general'));
    serveChat({ id: 'chat-1', title: 'Generated title' });

    renderChatView({
      chatId: 'chat-1',
      initialChat: { id: 'chat-1', agent: 'general', title: 'Plan the launch' },
    });

    await waitFor(() => expect(lastStepNav()).toEqual([chatsCrumb, { label: 'Plan the launch' }]));

    act(() => {
      window.dispatchEvent(new Event(CHAT_MUTATION_EVENT));
    });

    await waitFor(() => expect(lastStepNav()).toEqual([chatsCrumb, { label: 'Generated title' }]));
  });

  it('labels the thread when a custom chat component replaces the default chat', async () => {
    const CustomChat = vi.fn(() => null);

    useManifest(agentEntry('general'));

    renderChatView({
      ChatComponent: CustomChat,
      chatId: 'chat-1',
      initialChat: { id: 'chat-1', agent: 'general', title: 'Quarterly plan' },
    });

    await waitFor(() => expect(CustomChat).toHaveBeenCalled());

    expect(lastStepNav()).toEqual([chatsCrumb, { label: 'Quarterly plan' }]);
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it('labels the thread before chat preferences load', async () => {
    useManifest(agentEntry('general'));
    mocks.getPreference.mockReturnValue(new Promise(() => {}));

    renderChatView({
      chatId: 'chat-1',
      initialChat: { id: 'chat-1', agent: 'general', title: 'Quarterly plan' },
    });

    await waitFor(() => expect(lastStepNav()).toEqual([chatsCrumb, { label: 'Quarterly plan' }]));

    expect(mocks.chat).not.toHaveBeenCalled();
  });
});
