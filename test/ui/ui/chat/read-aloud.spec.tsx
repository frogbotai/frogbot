import type { ChatManifest } from '@frogbotai/protocol';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UIMessage } from 'ai';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatId, ChatPlatformAdapter } from '../../../../packages/ui/src/chat/adapter';
import { Chat, type MessageActionsSlotProps } from '../../../../packages/ui/src/chat/chat';
import { ReadAloudMessageAction } from '../../../../packages/ui/src/chat/message-actions';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';
import { useReadAloud } from '../../../../packages/ui/src/chat/use-read-aloud';
import { type } from './composerEditor';

const long = (word: string) => `${word} `.repeat(500).trim();

let audios: HTMLMediaElement[] = [];
let urls = 0;

const createObjectURL = vi.fn(() => `blob:audio-${++urls}`);
const revokeObjectURL = vi.fn();

function lastAudio() {
  const audio = audios.at(-1);

  if (!audio) throw new Error('nothing played');

  return audio;
}

async function end(audio = lastAudio()) {
  await act(async () => {
    audio.dispatchEvent(new Event('ended'));
    await Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });

  return { promise, resolve, reject };
}

function blob(text: string) {
  return new Blob([text], { type: 'audio/mpeg' });
}

beforeEach(() => {
  audios = [];
  urls = 0;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();

  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    audios.push(this);

    return Promise.resolve();
  });

  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ReadAloudMessageAction', () => {
  it('labels the idle and active states and reports pressed', () => {
    const { rerender } = render(<ReadAloudMessageAction active={false} onToggle={vi.fn()} />);
    const idle = screen.getByRole('button', { name: 'Read aloud' });

    expect(idle.getAttribute('aria-pressed')).toBe('false');

    rerender(<ReadAloudMessageAction active onToggle={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Stop reading' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('shows an error as an alert', () => {
    render(<ReadAloudMessageAction active={false} error="Nope" onToggle={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toBe('Nope');
  });
});

const texts: Record<string, string> = {
  a: 'Hello from **A**.',
  b: 'Hello from B.',
  long: `${long('first')}\n\n${long('second')}`,
};

function Harness({ speak }: { speak: NonNullable<ChatPlatformAdapter['speak']> }) {
  const readAloud = useReadAloud({ speak });

  return (
    <>
      {Object.keys(texts).map((id) => (
        <div key={id} data-testid={id}>
          <ReadAloudMessageAction
            active={readAloud.activeId === id && readAloud.status !== 'idle'}
            error={readAloud.error?.id === id ? readAloud.error.message : undefined}
            onToggle={() => readAloud.toggle(id, texts[id])}
          />
        </div>
      ))}
      <output>{readAloud.status}</output>
    </>
  );
}

function button(id: string) {
  return within(screen.getByTestId(id)).getByRole('button');
}

describe('useReadAloud', () => {
  it('reads the speakable text and resets when playback ends', async () => {
    const speak = vi.fn((text: string) => Promise.resolve(blob(text)));
    const user = userEvent.setup();

    render(<Harness speak={speak} />);
    await user.click(button('a'));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('playing'));

    expect(speak).toHaveBeenCalledExactlyOnceWith('Hello from A.', expect.anything());
    expect(button('a').getAttribute('aria-label')).toBe('Stop reading');

    await end();

    await waitFor(() => expect(button('a').getAttribute('aria-label')).toBe('Read aloud'));

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:audio-1');
  });

  it('requests chunks in order and fetches the next before the current ends', async () => {
    const speak = vi.fn((text: string) => Promise.resolve(blob(text)));
    const user = userEvent.setup();

    render(<Harness speak={speak} />);
    await user.click(button('long'));

    await waitFor(() => expect(speak).toHaveBeenCalledTimes(2));

    expect(audios).toHaveLength(1);
    expect(speak.mock.calls.map(([text]) => text.split(' ')[0])).toEqual(['first', 'second']);

    await end();

    await waitFor(() => expect(audios).toHaveLength(2));

    expect(lastAudio().getAttribute('src')).toBe('blob:audio-2');
  });

  it('stops the first message when another starts', async () => {
    const signals: AbortSignal[] = [];
    const speak = vi.fn((_text: string, { signal }: { signal: AbortSignal }) => {
      signals.push(signal);

      return new Promise<Blob>(() => undefined);
    });

    const user = userEvent.setup();

    render(<Harness speak={speak} />);
    await user.click(button('a'));
    await user.click(button('b'));

    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    expect(button('a').getAttribute('aria-label')).toBe('Read aloud');
    expect(button('b').getAttribute('aria-label')).toBe('Stop reading');
  });

  it('aborts the request and revokes urls when stopped', async () => {
    const second = deferred<Blob>();
    const signals: AbortSignal[] = [];
    const speak = vi.fn((text: string, { signal }: { signal: AbortSignal }) => {
      signals.push(signal);

      return text.startsWith('first') ? Promise.resolve(blob(text)) : second.promise;
    });

    const user = userEvent.setup();

    render(<Harness speak={speak} />);
    await user.click(button('long'));
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
    await user.click(button('long'));

    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:audio-1');
    expect(lastAudio().hasAttribute('src')).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('idle');
  });

  it('replays the last message from the cache', async () => {
    const speak = vi.fn((text: string) => Promise.resolve(blob(text)));
    const user = userEvent.setup();

    render(<Harness speak={speak} />);
    await user.click(button('a'));
    await waitFor(() => expect(audios).toHaveLength(1));
    await end();
    await user.click(button('a'));

    await waitFor(() => expect(audios).toHaveLength(2));

    expect(speak).toHaveBeenCalledOnce();
  });

  it('shows an alert and resets the button when a request fails', async () => {
    const speak = vi
      .fn<NonNullable<ChatPlatformAdapter['speak']>>(() => new Promise<Blob>(() => undefined))
      .mockRejectedValueOnce(new Error('quota'));

    const user = userEvent.setup();

    render(<Harness speak={speak} />);
    await user.click(button('a'));

    expect((await within(screen.getByTestId('a')).findByRole('alert')).textContent).toBe(
      "Couldn't read this message aloud.",
    );
    expect(button('a').getAttribute('aria-label')).toBe('Read aloud');

    await user.click(button('a'));

    expect(within(screen.getByTestId('a')).queryByRole('alert')).toBeNull();
  });

  it('stops playback on unmount', async () => {
    const speak = vi.fn((text: string) => Promise.resolve(blob(text)));
    const user = userEvent.setup();
    const { unmount } = render(<Harness speak={speak} />);

    await user.click(button('a'));
    await waitFor(() => expect(audios).toHaveLength(1));
    unmount();

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:audio-1');
  });
});

const agent: ChatManifest['agents'][number] = {
  slug: 'local',
  label: 'Local',
  source: 'config',
  defaultModel: 'openai/gpt-4o',
  models: ['openai/gpt-4o'],
};

const conversations: Record<string, UIMessage[]> = {
  one: [
    { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Question one' }] },
    { id: 'reply-1', role: 'assistant', parts: [{ type: 'text', text: 'Answer one.' }] },
    { id: 'reply-2', role: 'assistant', parts: [{ type: 'text', text: 'Answer two.' }] },
    { id: 'reply-code', role: 'assistant', parts: [{ type: 'text', text: '```\ncode\n```' }] },
  ],
  two: [{ id: 'reply-3', role: 'assistant', parts: [{ type: 'text', text: 'Other chat.' }] }],
};

function chatAdapter({
  speak,
  manifestSpeak = true,
}: {
  speak?: ChatPlatformAdapter['speak'];
  manifestSpeak?: boolean;
}): ChatPlatformAdapter {
  return {
    loadManifest: () =>
      Promise.resolve({
        defaultAgent: 'local',
        agents: [agent],
        transcribe: false,
        speak: manifestSpeak,
      }),
    createTransport: () => ({
      sendMessages: () => new Promise(() => undefined),
      reconnectToStream: () => Promise.resolve(null),
    }),
    listChats: ({ page }) =>
      Promise.resolve({
        docs: [],
        page,
        totalDocs: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      }),
    getChat: (chatId) =>
      Promise.resolve({ id: chatId, agent: 'local', title: String(chatId), lastMessageAt: '' }),
    loadMessages: (chatId) =>
      Promise.resolve({ messages: conversations[String(chatId)] ?? [], queued: [] }),
    ...(speak && { speak }),
  };
}

function Host({
  adapter,
  assistantMessageActions,
}: {
  adapter: ChatPlatformAdapter;
  assistantMessageActions?: (props: MessageActionsSlotProps) => React.ReactNode;
}) {
  const [chatId, setChatId] = useState<ChatId>('one');

  return (
    <ChatProvider adapter={adapter}>
      <button type="button" onClick={() => setChatId('two')}>
        Switch chat
      </button>
      <Chat
        agent="local"
        chatId={chatId}
        onChatIdChange={(id) => setChatId(id ?? 'one')}
        assistantMessageActions={assistantMessageActions}
      />
    </ChatProvider>
  );
}

function messageActions(text: string) {
  const message = screen.getByText(text).closest<HTMLElement>('.fb-message');

  if (!message) throw new Error(`no message for ${text}`);

  return within(message);
}

describe('Chat read aloud', { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the button on assistant replies with speakable text only', async () => {
    render(<Host adapter={chatAdapter({ speak: vi.fn(() => Promise.resolve(blob('x'))) })} />);

    await screen.findByText('Answer one.');

    expect(messageActions('Answer one.').getByRole('button', { name: 'Read aloud' })).toBeTruthy();
    expect(messageActions('Question one').queryByRole('button', { name: 'Read aloud' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Read aloud' })).toHaveLength(2);
  });

  it.each([
    ['the manifest', { manifestSpeak: false, speak: vi.fn() }],
    ['the adapter', { manifestSpeak: true }],
  ])('hides the button when %s has no speak', async (_, options) => {
    render(<Host adapter={chatAdapter(options)} />);

    await screen.findByText('Answer one.');

    expect(screen.queryByRole('button', { name: 'Read aloud' })).toBeNull();
  });

  it('hides the button while a reply is pending', async () => {
    const user = userEvent.setup();

    render(<Host adapter={chatAdapter({ speak: vi.fn(() => Promise.resolve(blob('x'))) })} />);
    await screen.findByText('Answer one.');

    type('Another question', await screen.findByRole('textbox', { name: 'Message' }));
    await user.click(await screen.findByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Read aloud' })).toBeNull());
  });

  it('stops the first reply when a second starts', async () => {
    const signals: AbortSignal[] = [];
    const speak = vi.fn((_text: string, { signal }: { signal: AbortSignal }) => {
      signals.push(signal);

      return new Promise<Blob>(() => undefined);
    });

    const user = userEvent.setup();

    render(<Host adapter={chatAdapter({ speak })} />);
    await screen.findByText('Answer one.');
    await user.click(messageActions('Answer one.').getByRole('button', { name: 'Read aloud' }));
    await user.click(messageActions('Answer two.').getByRole('button', { name: 'Read aloud' }));

    expect(signals[0]?.aborted).toBe(true);
    expect(messageActions('Answer one.').getByRole('button', { name: 'Read aloud' })).toBeTruthy();
    expect(
      messageActions('Answer two.').getByRole('button', { name: 'Stop reading' }),
    ).toBeTruthy();
  });

  it('stops playback when a new message is sent', async () => {
    const signals: AbortSignal[] = [];
    const speak = vi.fn((_text: string, { signal }: { signal: AbortSignal }) => {
      signals.push(signal);

      return Promise.resolve(blob('x'));
    });

    const user = userEvent.setup();

    render(<Host adapter={chatAdapter({ speak })} />);
    await screen.findByText('Answer one.');
    await user.click(messageActions('Answer one.').getByRole('button', { name: 'Read aloud' }));
    await waitFor(() => expect(audios).toHaveLength(1));

    type('Another question', await screen.findByRole('textbox', { name: 'Message' }));
    await user.click(await screen.findByRole('button', { name: 'Send' }));

    await waitFor(() => expect(signals[0]?.aborted).toBe(true));
  });

  it('stops playback when a user message is edited', async () => {
    const signals: AbortSignal[] = [];
    const speak = vi.fn((_text: string, { signal }: { signal: AbortSignal }) => {
      signals.push(signal);

      return new Promise<Blob>(() => undefined);
    });

    const user = userEvent.setup();

    render(<Host adapter={chatAdapter({ speak })} />);
    await screen.findByText('Answer one.');
    await user.click(messageActions('Answer one.').getByRole('button', { name: 'Read aloud' }));
    await user.click(messageActions('Question one').getByRole('button', { name: 'Edit' }));

    await waitFor(() => expect(signals[0]?.aborted).toBe(true));
  });

  it('stops playback when the chat changes', async () => {
    const signals: AbortSignal[] = [];
    const speak = vi.fn((_text: string, { signal }: { signal: AbortSignal }) => {
      signals.push(signal);

      return new Promise<Blob>(() => undefined);
    });

    const user = userEvent.setup();

    render(<Host adapter={chatAdapter({ speak })} />);
    await screen.findByText('Answer one.');
    await user.click(messageActions('Answer one.').getByRole('button', { name: 'Read aloud' }));
    await user.click(screen.getByRole('button', { name: 'Switch chat' }));

    await waitFor(() => expect(signals[0]?.aborted).toBe(true));
  });

  it('gives a custom assistant actions slot the button in its default actions', async () => {
    render(
      <Host
        adapter={chatAdapter({ speak: vi.fn(() => Promise.resolve(blob('x'))) })}
        assistantMessageActions={({ defaultActions }) => (
          <div data-testid="custom">{defaultActions}</div>
        )}
      />,
    );

    await screen.findByText('Answer one.');

    expect(
      within(screen.getAllByTestId('custom')[0]).getByRole('button', { name: 'Read aloud' }),
    ).toBeTruthy();
  });
});
