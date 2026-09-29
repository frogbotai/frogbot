import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ManifestEntry = {
  slug: string;
  label: string;
  source: 'config';
  defaultModel: string;
  models: string[];
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
  getPreference: vi.fn(),
  manifest: { defaultAgent: 'general', agents: [] as unknown[] },
  provider: vi.fn(),
  push: vi.fn(),
  setPreference: vi.fn(),
  startRouteTransition: vi.fn((transition: () => void) => transition()),
}));

vi.mock('@payloadcms/ui', () => ({
  usePreferences: () => ({
    getPreference: mocks.getPreference,
    setPreference: mocks.setPreference,
  }),
  useRouteTransition: () => ({ startRouteTransition: mocks.startRouteTransition }),
}));

vi.mock('next/navigation.js', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@frogbotai/ui/chat', async () => {
  const { ModelSelector } = await import('../../../../packages/ui/src/chat/model-selector.js');

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
    useChatProvider: () => ({ agentManifest: mocks.manifest, loading: false }),
  };
});

const { ChatViewClient } = await import('../../../../packages/next/src/exports/ChatView.client.js');
const { MessagePart } = await import('../../../../packages/ui/src/chat/message-part.js');

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

function renderChatView(props: Partial<Parameters<typeof ChatViewClient>[0]> = {}) {
  return render(
    <ChatViewClient
      agent="general"
      documentPath="/admin/collections/conversations"
      initialMessages={[]}
      {...props}
    />,
  );
}

function lastChatProps() {
  return mocks.chat.mock.calls.at(-1)?.[0] as { model?: string; reasoning?: string };
}

async function trigger() {
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
    mocks.provider.mockClear();
    mocks.push.mockClear();
    mocks.setPreference.mockClear();
    mocks.startRouteTransition.mockClear();
    mocks.getPreference.mockReset().mockResolvedValue(null);
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

  it('replaces the create route once without changing the mounted chat', async () => {
    useManifest(agentEntry('general'), agentEntry('sales'));

    const replaceState = vi.spyOn(window.history, 'replaceState');
    const general = [{ kind: 'lookup', render: () => null }];
    const sales = [{ kind: 'lookup', render: () => null }];
    renderChatView({ toolRenderersByAgent: { general, sales } });
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

  it('ignores the chat selection when starting a new chat', async () => {
    useManifest(reasoningAgent);

    renderChatView({ initialSelection: { model: 'anthropic/opus', reasoning: 'max' } });

    expect((await trigger()).textContent).toBe('gpt-5 · Default');
  });

  it('navigates to another chat opened from an existing chat', async () => {
    useManifest(agentEntry('general'));

    const replaceState = vi.spyOn(window.history, 'replaceState');

    replaceState.mockClear();

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
});
