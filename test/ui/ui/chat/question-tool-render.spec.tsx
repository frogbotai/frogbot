import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { UIMessage, UIMessageChunk } from 'ai';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Chat } from '../../../../packages/ui/src/chat/chat';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';
import type { ToolPartValue } from '../../../../packages/ui/src/exports/chat-tools';
import { QuestionToolRender } from '../../../../packages/ui/src/exports/chat-tools';

const api = 'https://frogbot.example/api';
const agent = 'questioner';
const chatId = 'chat-1';

const target = {
  header: 'Target',
  question: 'Where should this deploy?',
  options: [
    { label: 'Staging', description: 'Safe to try' },
    { label: 'Production', description: 'Live traffic' },
  ],
  custom: true,
};

const checks = {
  header: 'Checks',
  question: 'Which checks should run?',
  options: [{ label: 'Lint' }, { label: 'Tests' }, { label: 'Types' }],
  multiple: true,
  custom: false,
};

function questionPart(
  questions: unknown[],
  values: Partial<ToolPartValue> = {},
): Extract<ToolPartValue, { type: 'dynamic-tool' }> {
  return {
    type: 'dynamic-tool',
    toolName: 'question',
    toolCallId: 'call-1',
    state: 'input-available',
    input: { questions },
    ...values,
  } as Extract<ToolPartValue, { type: 'dynamic-tool' }>;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe('QuestionToolRender', () => {
  it('submits a single choice on the first click and ignores a double click', () => {
    const addToolOutput = vi.fn(() => new Promise<void>(() => undefined));

    render(
      <QuestionToolRender
        part={questionPart([{ ...target, custom: false }])}
        addToolOutput={addToolOutput}
        dismiss={vi.fn()}
      />,
    );

    const staging = screen.getByRole('button', { name: /Staging/ });

    fireEvent.click(staging);
    fireEvent.click(staging);

    expect(addToolOutput).toHaveBeenCalledOnce();
    expect(addToolOutput).toHaveBeenCalledWith({
      answers: [{ header: 'Target', selected: ['Staging'] }],
    });
    expect((staging as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
  });

  it('submits a custom answer instead of an option for a single choice', () => {
    const addToolOutput = vi.fn(() => Promise.resolve());

    render(
      <QuestionToolRender
        part={questionPart([target])}
        addToolOutput={addToolOutput}
        dismiss={vi.fn()}
      />,
    );

    const submit = screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement;

    expect(submit.disabled).toBe(true);

    const custom = screen.getByRole('textbox', { name: 'Other answer for Target' });

    fireEvent.change(custom, { target: { value: '  A preview branch  ' } });
    fireEvent.keyDown(custom, { key: 'Enter' });

    expect(addToolOutput).toHaveBeenCalledWith({
      answers: [{ header: 'Target', selected: [], custom: 'A preview branch' }],
    });
  });

  it('steps through several questions and submits every answer in order', () => {
    const addToolOutput = vi.fn(() => Promise.resolve());

    render(
      <QuestionToolRender
        part={questionPart([target, checks])}
        addToolOutput={addToolOutput}
        dismiss={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('tab').map(({ textContent }) => textContent)).toEqual([
      'Target',
      'Checks',
    ]);

    fireEvent.click(screen.getByRole('radio', { name: /Production/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    const submit = screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement;

    expect(screen.getByText('Which checks should run?')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Types' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lint' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tests' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tests' }));

    expect(screen.getByRole('checkbox', { name: 'Lint' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('checkbox', { name: 'Tests' }).getAttribute('aria-checked')).toBe(
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('radio', { name: /Production/ }).getAttribute('aria-checked')).toBe(
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(addToolOutput).toHaveBeenCalledWith({
      answers: [
        { header: 'Target', selected: ['Production'] },
        { header: 'Checks', selected: ['Lint', 'Types'] },
      ],
    });
  });

  it('keeps a single choice to either an option or a custom answer', () => {
    const addToolOutput = vi.fn(() => Promise.resolve());

    render(
      <QuestionToolRender
        part={questionPart([target, checks])}
        addToolOutput={addToolOutput}
        dismiss={vi.fn()}
      />,
    );

    const staging = screen.getByRole('radio', { name: /Staging/ });
    const custom = screen.getByRole('textbox', { name: 'Other answer for Target' });

    fireEvent.click(staging);
    fireEvent.change(custom, { target: { value: 'Canary' } });

    expect(staging.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(staging);

    expect((custom as HTMLTextAreaElement).value).toBe('');
  });

  it('disables the card while a dismissal is in flight', async () => {
    const request = deferred();
    const dismiss = vi.fn(() => request.promise);

    render(
      <QuestionToolRender
        part={questionPart([target])}
        addToolOutput={vi.fn()}
        dismiss={dismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(dismiss).toHaveBeenCalledOnce();
    expect((screen.getByRole('button', { name: /Staging/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    await act(async () => request.resolve());

    expect((screen.getByRole('button', { name: /Staging/ }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('renders a read-only question without callbacks', () => {
    render(<QuestionToolRender part={questionPart([target])} />);

    expect((screen.getByRole('button', { name: /Staging/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
  });

  it('renders a streaming question as preparing', () => {
    render(<QuestionToolRender part={questionPart([], { state: 'input-streaming' })} />);

    expect(screen.getByText('Preparing question')).toBeTruthy();
  });

  it('summarizes an answered question from its output', () => {
    const { container } = render(
      <QuestionToolRender
        part={questionPart([target, checks], {
          state: 'output-available',
          output: {
            answers: [
              { header: 'Target', selected: [], custom: 'Canary' },
              { header: 'Checks', selected: ['Lint', 'Types'] },
            ],
          },
        })}
      />,
    );

    expect(container.querySelector('.fb-question-tool--answered')).toBeTruthy();
    expect(screen.getByText('Answered')).toBeTruthy();
    expect(screen.getByText('Canary')).toBeTruthy();
    expect(screen.getByText('Lint, Types')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders a dismissed question from its error text', () => {
    const { container } = render(
      <QuestionToolRender
        part={questionPart([target], {
          state: 'output-error',
          errorText: 'Dismissed by the user.',
        })}
      />,
    );

    expect(container.querySelector('.fb-question-tool--closed')).toBeTruthy();
    expect(screen.getByText('Not answered')).toBeTruthy();
    expect(screen.getByText('Dismissed by the user.')).toBeTruthy();
    expect(screen.getByText('Where should this deploy?')).toBeTruthy();
  });
});

type Route = (url: URL, init: RequestInit | undefined) => Response | Promise<Response> | undefined;

const server = {
  documents: [] as Array<Record<string, unknown>>,
  routes: [] as Route[],
  fetch: vi.fn<typeof fetch>(),
};

const userMessage = {
  id: 'user-1',
  chat: chatId,
  role: 'user',
  parts: [{ type: 'text', text: 'Deploy it' }],
  status: 'active',
};

const pendingMessage = {
  id: 'assistant-1',
  chat: chatId,
  role: 'assistant',
  parts: [
    { type: 'step-start' },
    {
      type: 'tool-question',
      toolCallId: 'call-1',
      state: 'input-available',
      input: { questions: [{ ...target, custom: false }] },
    },
  ],
  status: 'active',
};

function stream(chunks: UIMessageChunk[]) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        chunks.forEach((chunk) => writer.write(chunk));
      },
    }),
    headers: { 'X-FrogBot-Chat-Id': chatId },
  });
}

function reply(text: string): UIMessageChunk[] {
  return [
    { type: 'start', messageId: 'assistant-1' },
    { type: 'start-step' },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: text },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish-step' },
    { type: 'finish' },
  ];
}

function requests(pathname: string, method = 'POST') {
  return server.fetch.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method,
  );
}

function body(call: Parameters<typeof fetch>) {
  return JSON.parse(String(call[1]?.body));
}

function renderChat() {
  return render(
    <ChatProvider
      adapter={{ apiBase: api, fetch: server.fetch }}
      toolRenderers={[{ kind: 'question', render: QuestionToolRender }]}
    >
      <Chat agent={agent} defaultChatId={chatId} errorContent={(error) => error.message} />
    </ChatProvider>,
  );
}

describe('QuestionToolRender in Chat', () => {
  beforeEach(() => {
    server.documents = [userMessage, pendingMessage];
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

      if (url.pathname === '/api/messages') return Response.json({ docs: server.documents });

      return new Response(null, { status: 404 });
    });
  });

  it('answers through addToolOutput and streams the continuation into the same message', async () => {
    server.routes.push((url) =>
      url.pathname === `/api/agents/${agent}` ? stream(reply('Deploying to staging.')) : undefined,
    );

    renderChat();

    const staging = await screen.findByRole('button', { name: /Staging/ });

    fireEvent.click(staging);
    fireEvent.click(staging);

    expect(await screen.findByText('Deploying to staging.')).toBeTruthy();
    expect(screen.getByText('Answered')).toBeTruthy();
    expect(requests(`/api/agents/${agent}`)).toHaveLength(1);

    const sent = body(requests(`/api/agents/${agent}`)[0]!);

    expect(sent.chatId).toBe(chatId);
    expect(sent.messages.at(-1)).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-question',
          toolCallId: 'call-1',
          state: 'output-available',
          output: { answers: [{ header: 'Target', selected: ['Staging'] }] },
        },
      ],
    });
    expect(screen.getAllByText('Deploying to staging.')).toHaveLength(1);
    expect(document.querySelectorAll('[data-message]')).toHaveLength(2);
  });

  it('dismisses through the settle endpoint and applies the settled part without sending', async () => {
    const dismissed = {
      ...pendingMessage.parts[1],
      state: 'output-error',
      errorText: 'Dismissed by the user.',
    };

    server.routes.push((url) =>
      url.pathname === `/api/agents/${agent}/chats/${chatId}/settle`
        ? Response.json({
            status: 'dismissed',
            chatId,
            settlement: { status: 'settled', allSettled: true, part: dismissed },
          })
        : undefined,
    );

    renderChat();

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));

    expect(await screen.findByText('Dismissed by the user.')).toBeTruthy();
    expect(body(requests(`/api/agents/${agent}/chats/${chatId}/settle`)[0]!)).toEqual({
      toolCallId: 'call-1',
      dismissed: true,
    });
    expect(requests(`/api/agents/${agent}`)).toHaveLength(0);
    expect(requests('/api/messages', 'GET')).toHaveLength(1);
  });

  it('shows the winning answer when another participant settled the question first', async () => {
    server.routes.push((url) => {
      if (url.pathname !== `/api/agents/${agent}`) return undefined;

      server.documents = [
        userMessage,
        {
          ...pendingMessage,
          parts: [
            pendingMessage.parts[0],
            {
              ...pendingMessage.parts[1],
              state: 'output-available',
              output: { answers: [{ header: 'Target', selected: ['Production'] }] },
            },
          ],
        },
      ];

      return Response.json(
        { error: 'This call has already been answered.', code: 'already-settled' },
        { status: 409 },
      );
    });

    renderChat();

    fireEvent.click(await screen.findByRole('button', { name: /Staging/ }));

    expect(await screen.findByText('Production')).toBeTruthy();
    expect(screen.queryByText('Staging')).toBeNull();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('queues a message sent while a question is pending and loads its turn after answering', async () => {
    let queuedId = '';

    server.routes.push(
      (url, init) => {
        if (url.pathname !== `/api/agents/${agent}`) return undefined;

        const sent = JSON.parse(String(init?.body)) as { messages: UIMessage[] };
        const last = sent.messages.at(-1)!;

        if (last.role !== 'user') return undefined;

        queuedId = last.id;

        return stream([
          { type: 'data-queued', data: { messageId: last.id, delivery: 'queue' }, transient: true },
        ]);
      },
      (url) => {
        if (url.pathname !== `/api/agents/${agent}`) return undefined;

        server.documents = [
          userMessage,
          {
            ...pendingMessage,
            parts: [
              pendingMessage.parts[0],
              {
                ...pendingMessage.parts[1],
                state: 'output-available',
                output: { answers: [{ header: 'Target', selected: ['Staging'] }] },
              },
              { type: 'text', text: 'Deploying to staging.' },
            ],
          },
          {
            id: queuedId,
            chat: chatId,
            role: 'user',
            parts: [{ type: 'text', text: 'Also check the logs' }],
            status: 'active',
          },
          {
            id: 'assistant-2',
            chat: chatId,
            role: 'assistant',
            parts: [{ type: 'text', text: 'The logs are clean.' }],
            status: 'active',
          },
        ];

        return stream(reply('Deploying to staging.'));
      },
      (url) =>
        url.pathname === `/api/agents/${agent}/chats/${chatId}/pending`
          ? Response.json({ chatId, state: 'idle', pending: [] })
          : undefined,
    );

    const { container } = renderChat();

    await screen.findByRole('button', { name: /Staging/ });

    const composer = container.querySelector('.fb-composer__textarea') as HTMLTextAreaElement;

    fireEvent.change(composer, { target: { value: 'Also check the logs' } });
    fireEvent.keyDown(composer, { key: 'Enter' });

    const queued = await screen.findByRole('status');

    expect(within(queued).getByText('Queued')).toBeTruthy();
    expect(within(queued).getByText('Also check the logs')).toBeTruthy();
    expect(within(screen.getByRole('log')).queryByText('Also check the logs')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Staging/ }));

    expect(await screen.findByText('The logs are clean.')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(within(screen.getByRole('log')).getByText('Also check the logs')).toBeTruthy();
    expect(requests(`/api/agents/${agent}`)).toHaveLength(2);
    expect(requests(`/api/agents/${agent}/chats/${chatId}/pending`, 'GET')).toHaveLength(1);
  });

  it('does not resubmit a completed server tool step after a queued message', async () => {
    server.documents = [
      userMessage,
      {
        ...pendingMessage,
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-lookup',
            toolCallId: 'lookup-1',
            state: 'output-available',
            input: { topic: 'logs' },
            output: 'Found logs.',
          },
        ],
      },
    ];
    server.routes.push((url, init) => {
      if (url.pathname !== `/api/agents/${agent}`) return undefined;

      const sent = JSON.parse(String(init?.body)) as { messages: UIMessage[] };

      return stream([
        {
          type: 'data-queued',
          data: { messageId: sent.messages.at(-1)!.id, delivery: 'queue' },
          transient: true,
        },
      ]);
    });

    const { container } = renderChat();

    await screen.findByText('lookup');

    const composer = container.querySelector('.fb-composer__textarea') as HTMLTextAreaElement;

    fireEvent.change(composer, { target: { value: 'Anything else?' } });
    fireEvent.keyDown(composer, { key: 'Enter' });

    expect(await screen.findByRole('status')).toBeTruthy();

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
    await act(() => new Promise((resolve) => setTimeout(resolve)));

    expect(requests(`/api/agents/${agent}`)).toHaveLength(1);
  });

  it('restores queued messages from history into the queued indicator', async () => {
    server.documents = [
      userMessage,
      pendingMessage,
      {
        id: 'user-2',
        chat: chatId,
        role: 'user',
        parts: [{ type: 'text', text: 'Waiting in line' }],
        status: 'queued',
      },
    ];

    renderChat();

    const queued = await screen.findByRole('status');

    expect(within(queued).getByText('Waiting in line')).toBeTruthy();
    expect(within(screen.getByRole('log')).queryByText('Waiting in line')).toBeNull();
    expect(screen.getByRole('button', { name: /Staging/ })).toBeTruthy();
  });
});
