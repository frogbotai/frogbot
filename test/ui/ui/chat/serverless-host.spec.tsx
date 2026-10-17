import type { ChatManifest } from '@frogbotai/protocol';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { simulateReadableStream, type UIMessage, type UIMessageChunk } from 'ai';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ChatDocument,
  ChatId,
  ChatPlatformAdapter,
} from '../../../../packages/ui/src/chat/adapter';
import { Chat } from '../../../../packages/ui/src/chat/chat';
import { ChatHistory } from '../../../../packages/ui/src/chat/chat-history';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';
import { useChats } from '../../../../packages/ui/src/chat/use-chats';
import { type } from './composerEditor';

vi.mock('@frogbotai/sdk', () => {
  throw new Error('the chat UI must not load @frogbotai/sdk');
});

const manifest: ChatManifest = {
  defaultAgent: 'local',
  agents: [
    {
      slug: 'local',
      label: 'Local',
      source: 'config',
      defaultModel: 'openai/gpt-4o',
      models: ['openai/gpt-4o'],
    },
  ],
  transcribe: false,
};

function reply(id: string, text: string): UIMessageChunk[] {
  return [
    { type: 'start', messageId: `assistant-${id}` },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: text },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish' },
  ];
}

function textOf(message: UIMessage) {
  return message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
}

function inMemoryAdapter({ manage = true } = {}): ChatPlatformAdapter {
  const chats = new Map<string, ChatDocument>();
  const messages = new Map<string, UIMessage[]>();
  let next = 0;

  const adapter: ChatPlatformAdapter = {
    loadManifest: () => Promise.resolve(manifest),
    createTransport: ({ agent, request, onChatId }) => ({
      sendMessages: ({ messages: sent }) => {
        let chatId = request().chatId;

        if (chatId === undefined) {
          chatId = `local-${++next}`;

          chats.set(chatId, {
            id: chatId,
            agent,
            title: textOf(sent[0]),
            lastMessageAt: new Date().toISOString(),
          });

          onChatId(chatId);
        }

        const answer = `Echo: ${textOf(sent.at(-1)!)}`;

        messages.set(String(chatId), [
          ...sent,
          { id: `assistant-${chatId}`, role: 'assistant', parts: [{ type: 'text', text: answer }] },
        ]);

        return Promise.resolve(simulateReadableStream({ chunks: reply(String(chatId), answer) }));
      },
      reconnectToStream: () => Promise.resolve(null),
    }),
    listChats: ({ agent, page }) => {
      const docs = [...chats.values()].filter((chat) => !agent || chat.agent === agent);

      return Promise.resolve({
        docs,
        page,
        totalDocs: docs.length,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    },
    getChat: (chatId) => {
      const chat = chats.get(String(chatId));

      return chat ? Promise.resolve(chat) : Promise.reject(new Error('Not found'));
    },
    loadMessages: (chatId) =>
      Promise.resolve({ messages: messages.get(String(chatId)) ?? [], queued: [] }),
  };

  if (!manage) return adapter;

  return {
    ...adapter,
    renameChat: (chatId, title) => {
      const chat = { ...chats.get(String(chatId))!, title };

      chats.set(String(chatId), chat);

      return Promise.resolve(chat);
    },
    deleteChat: (chatId) => {
      chats.delete(String(chatId));
      messages.delete(String(chatId));

      return Promise.resolve();
    },
  };
}

function Host({ adapter }: { adapter: ChatPlatformAdapter }) {
  const [chatId, setChatId] = useState<ChatId>();
  const chats = useChats({ adapter, agent: 'local', revalidate: true });

  return (
    <ChatProvider adapter={adapter}>
      <ChatHistory
        adapter={adapter}
        chats={chats.docs ?? []}
        activeChatId={chatId}
        fallbackTitle="Untitled"
        onChatChange={setChatId}
        onNewChat={() => setChatId(undefined)}
      />
      <Chat agent="local" chatId={chatId} onChatIdChange={setChatId} />
    </ChatProvider>
  );
}

function renderHost(adapter: ChatPlatformAdapter) {
  return render(<Host adapter={adapter} />);
}

async function send(text: string) {
  const user = userEvent.setup();

  type(text, await screen.findByRole('textbox', { name: 'Message' }));
  await user.click(screen.getByRole('button', { name: 'Send' }));

  return user;
}

function history() {
  return within(document.querySelector<HTMLElement>('.fb-chat-history')!);
}

describe('a chat host without a FrogBot server', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();

  beforeEach(() => {
    fetch.mockReset();
    vi.stubGlobal('fetch', fetch);

    vi.stubGlobal('matchMedia', () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('streams, lists, renames and deletes chats through an in-memory adapter', async () => {
    renderHost(inMemoryAdapter());

    const user = await send('Plan the launch');

    expect(await screen.findByText('Echo: Plan the launch')).not.toBeNull();

    const row = await history().findByRole('button', { name: 'Plan the launch' });

    await waitFor(() => expect(row.getAttribute('aria-current')).toBe('page'));

    expect(screen.queryByRole('button', { name: 'Branch' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add files' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use microphone' })).toBeNull();

    await user.click(history().getByRole('button', { name: 'Chat actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    const dialog = await screen.findByRole('dialog');

    expect(dialog.querySelector('.fb-rename-chat-dialog__suggestion')).toBeNull();

    const title = within(dialog).getByRole('textbox', { name: 'Chat title' });

    await user.clear(title);
    await user.type(title, 'Launch plan');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await history().findByRole('button', { name: 'Launch plan' })).not.toBeNull();

    await user.click(history().getByRole('button', { name: 'Chat actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(history().queryByRole('button', { name: 'Launch plan' })).toBeNull(),
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it('has no row menu when the adapter cannot rename or delete', async () => {
    renderHost(inMemoryAdapter({ manage: false }));

    await send('Draft the memo');

    expect(await history().findByRole('button', { name: 'Draft the memo' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Chat actions' })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
