import type { UIMessage } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatAdapterError } from '../../../../packages/ui/src/chat/adapter';
import { createRestChatAdapter } from '../../../../packages/ui/src/chat/rest/adapter';
import { CHAT_MUTATION_EVENT } from '../../../../packages/ui/src/chat/use-chats';

const apiBase = 'https://frogbot.example/api';

const serverManifest = {
  ai: { transcribe: { model: 'openai/whisper-1' } },
  chat: { enabled: true, chatsSlug: 'conversations', messagesSlug: 'turns', assetsSlug: 'uploads' },
  files: { slug: 'files' },
  agents: [{ slug: 'support', profile: { name: 'Ada', avatar: '/ada.png' } }, { slug: 'sales' }],
};

const agentManifest = {
  defaultAgent: 'support',
  agents: [
    {
      slug: 'sales',
      label: 'Sales',
      source: 'config',
      defaultModel: 'openai/test',
      models: ['openai/test'],
    },
    {
      slug: 'support',
      label: 'Support',
      source: 'collection',
      defaultModel: 'openai/test',
      models: ['openai/test'],
    },
  ],
};

const message: UIMessage = { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] };

type Route = (body: unknown) => Response | Promise<Response>;

function server(routes: Record<string, Route> = {}) {
  const calls: { method: string; path: string; body: unknown; headers: Headers }[] = [];

  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = String(input);
    const path = decodeURIComponent(url.slice(apiBase.length));
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as unknown)
        : (init?.body ?? undefined);

    calls.push({ method, path, body, headers: new Headers(init?.headers) });

    const route = routes[`${method} ${path}`];

    if (route) return route(body);

    if (path === '/frogbot') return Response.json(serverManifest);

    if (path === '/agents') return Response.json(agentManifest);

    return Response.json(path.includes('?') ? { docs: [] } : {});
  });

  return { calls, fetch };
}

function adapterFor(routes?: Record<string, Route>, slugs = true) {
  const backend = server(routes);
  const adapter = createRestChatAdapter({
    apiBase,
    fetch: backend.fetch,
    headers: () => ({ Authorization: 'Bearer runtime' }),
    ...(slugs ? { chatsSlug: 'conversations', messagesSlug: 'turns', assetsSlug: 'uploads' } : {}),
  });

  return { ...backend, adapter };
}

function emptyStream() {
  return new Response(new ReadableStream({ start: (controller) => controller.close() }));
}

function sdkError(status: number, body: unknown) {
  return () => Response.json(body, { status });
}

describe('createRestChatAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('merges /frogbot profiles into the /agents list and reads transcription', async () => {
    const { adapter, calls } = adapterFor(undefined, false);

    await expect(adapter.loadManifest({ signal: new AbortController().signal })).resolves.toEqual({
      defaultAgent: 'support',
      agents: [
        agentManifest.agents[0],
        { ...agentManifest.agents[1], profile: { name: 'Ada', avatar: '/ada.png' } },
      ],
      transcribe: true,
    });

    expect(calls.map(({ path }) => path).sort()).toEqual(['/agents', '/frogbot']);
    expect(calls.every(({ headers }) => headers.get('Authorization') === 'Bearer runtime')).toBe(
      true,
    );
  });

  it('returns null when chat is disabled', async () => {
    const { adapter } = adapterFor({
      'GET /frogbot': () => Response.json({ ...serverManifest, chat: { enabled: false } }),
    });

    await expect(
      adapter.loadManifest({ signal: new AbortController().signal }),
    ).resolves.toBeNull();
  });

  it('fetches /frogbot once across the manifest and slug lookups', async () => {
    const { adapter, calls } = adapterFor(undefined, false);

    await adapter.loadManifest({ signal: new AbortController().signal });
    await adapter.listChats({ page: 1, limit: 20 });
    await adapter.loadMessages('chat-1');
    await adapter.getChat('chat-1');

    expect(calls.filter(({ path }) => path === '/frogbot')).toHaveLength(1);
    expect(calls.map(({ path }) => path.split('?')[0])).toContain('/conversations');
    expect(calls.map(({ path }) => path.split('?')[0])).toContain('/turns');
  });

  it('reads /frogbot again for each manifest load, sharing one already in flight', async () => {
    const { adapter, calls } = adapterFor(undefined, false);
    const signal = new AbortController().signal;
    const frogbot = () => calls.filter(({ path }) => path === '/frogbot');

    await Promise.all([adapter.getChat('chat-1'), adapter.loadManifest({ signal })]);

    expect(frogbot()).toHaveLength(1);

    await adapter.loadManifest({ signal });
    await adapter.getChat('chat-1');

    expect(frogbot()).toHaveLength(2);
  });

  it('never fetches /frogbot when the slugs are passed', async () => {
    const { adapter, calls } = adapterFor();

    await adapter.listChats({ page: 1, limit: 20 });
    await adapter.loadMessages('chat-1');
    await adapter.deleteChat?.('chat-1');

    expect(calls.some(({ path }) => path === '/frogbot')).toBe(false);
  });

  it('retries /frogbot after a failed fetch', async () => {
    let fail = true;
    const { adapter, calls } = adapterFor(
      {
        'GET /frogbot': () => {
          if (!fail) return Response.json(serverManifest);

          fail = false;

          return Response.json({ errors: [{ message: 'down' }] }, { status: 503 });
        },
      },
      false,
    );

    await expect(adapter.listChats({ page: 1, limit: 20 })).rejects.toThrow('down');

    await adapter.listChats({ page: 1, limit: 20 });

    expect(calls.filter(({ path }) => path === '/frogbot')).toHaveLength(2);
  });

  it('sends each request with the method, path, query and body the server expects', async () => {
    const { adapter, calls } = adapterFor({
      'POST /frogbot/chat/branch': () => Response.json({ chatId: 'branched' }),
      'POST /frogbot/chat/suggest-title': () => Response.json({ suggestion: 'Night frogs' }),
      'GET /agents/support agent/chats/chat 1/pending': () => Response.json({ state: 'awaiting' }),
      'GET /turns?depth=0&limit=0&sort=createdAt&where[chat][equals]=chat+1': () =>
        Response.json({
          docs: [
            { id: 1, role: 'user', parts: [{ type: 'text', text: 'sent' }] },
            { id: 2, role: 'user', status: 'queued', parts: [{ type: 'text', text: 'later' }] },
          ],
        }),
    });

    await adapter.listChats({ agent: 'support', page: 2, limit: 10 });
    await adapter.getChat('chat 1');

    await expect(adapter.loadMessages('chat 1')).resolves.toEqual({
      messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'sent' }] }],
      queued: [{ id: '2', role: 'user', parts: [{ type: 'text', text: 'later' }] }],
    });

    await adapter.renameChat?.('chat 1', 'New');
    await adapter.updateChatAgent?.('chat 1', 'sales');

    await expect(adapter.branchChat?.('chat 1', 'message-1')).resolves.toBe('branched');
    await expect(adapter.suggestChatTitle?.('chat 1')).resolves.toBe('Night frogs');
    await expect(adapter.loadTurnState?.('support agent', 'chat 1')).resolves.toBe('awaiting');

    expect(calls.map(({ method, path, body }) => [method, path, body])).toEqual([
      [
        'GET',
        '/conversations?depth=0&sort=-lastMessageAt&page=2&limit=10&where[agent][equals]=support',
        undefined,
      ],
      ['GET', '/conversations/chat 1?depth=0', undefined],
      ['GET', '/turns?depth=0&limit=0&sort=createdAt&where[chat][equals]=chat+1', undefined],
      ['PATCH', '/conversations/chat 1', { title: 'New' }],
      ['PATCH', '/conversations/chat 1', { agent: 'sales' }],
      ['POST', '/frogbot/chat/branch', { chatId: 'chat 1', messageId: 'message-1' }],
      ['POST', '/frogbot/chat/suggest-title', { chatId: 'chat 1' }],
      ['GET', '/agents/support agent/chats/chat 1/pending', undefined],
    ]);
  });

  it('deletes every message before the chat', async () => {
    const { adapter, calls } = adapterFor({
      'GET /turns?depth=0&limit=0&where[chat][equals]=chat-1': () =>
        Response.json({ docs: [{ id: 'm1' }, { id: 2 }] }),
      'DELETE /turns/m1': () => new Response(null, { status: 204 }),
      'DELETE /turns/2': () => new Response(null, { status: 204 }),
      'DELETE /conversations/chat-1': () => new Response(null, { status: 204 }),
    });

    await adapter.deleteChat?.('chat-1');

    expect(calls[0]).toMatchObject({ method: 'GET', path: expect.stringMatching(/^\/turns\?/) });
    expect(
      calls
        .slice(1, 3)
        .map(({ path }) => path)
        .sort(),
    ).toEqual(['/turns/2', '/turns/m1']);
    expect(calls[3]).toMatchObject({ method: 'DELETE', path: '/conversations/chat-1' });
  });

  it('settles a dismissed tool call and recovers a settlement from a 409', async () => {
    const part = { type: 'tool-ask', toolCallId: 'call-1', state: 'output-available' };
    const settle = 'POST /agents/support/chats/chat-1/settle';

    const settled = adapterFor({
      [settle]: () => Response.json({ settlement: { status: 'settled', allSettled: true, part } }),
    });

    await expect(settled.adapter.dismissToolCall?.('support', 'chat-1', 'call-1')).resolves.toEqual(
      { status: 'settled', allSettled: true, part },
    );
    expect(settled.calls[0]?.body).toEqual({ toolCallId: 'call-1', dismissed: true });

    const raced = adapterFor({
      [settle]: sdkError(409, {
        settlement: { status: 'already-settled', allSettled: true, part },
      }),
    });

    await expect(raced.adapter.dismissToolCall?.('support', 'chat-1', 'call-1')).resolves.toEqual({
      status: 'already-settled',
      allSettled: true,
      part,
    });
  });

  it('throws a conflict for a 409 without a settlement', async () => {
    const { adapter } = adapterFor({
      'POST /agents/support/chats/chat-1/settle': sdkError(409, {
        errors: [{ message: 'Not awaiting' }],
      }),
    });

    const error = await adapter
      .dismissToolCall?.('support', 'chat-1', 'call-1')
      .catch((value) => value);

    expect(error).toBeInstanceOf(ChatAdapterError);
    expect(error).toMatchObject({ code: 'conflict', message: 'Not awaiting' });
  });

  it('uploads an attachment and returns its reference', async () => {
    const { adapter, calls } = adapterFor({
      'POST /uploads': () =>
        Response.json({
          doc: { id: 'asset-1', filename: 'a.txt', mimeType: 'text/plain', text: 'A' },
        }),
    });

    await expect(adapter.uploadAttachment?.(new File(['A'], 'a.txt'))).resolves.toEqual({
      id: 'asset-1',
      mediaType: 'text/plain',
      text: 'A',
    });
    expect(calls[0]?.body).toBeInstanceOf(FormData);
  });

  it.each([
    [
      'file-unreadable',
      sdkError(400, {
        errors: [{ message: 'Invalid file', data: { errors: [{ path: 'file', message: 'bad' }] } }],
      }),
    ],
    ['file-too-large', sdkError(413, { errors: [{ message: 'Too large' }] })],
  ])('maps a refused upload to %s', async (code, route) => {
    const { adapter } = adapterFor({ 'POST /uploads': route });
    const error = await adapter
      .uploadAttachment?.(new File(['A'], 'a.txt'))
      .catch((value) => value);

    expect(error).toBeInstanceOf(ChatAdapterError);
    expect((error as ChatAdapterError).code).toBe(code);
  });

  it('keeps other upload failures as they are', async () => {
    const { adapter } = adapterFor({
      'POST /uploads': sdkError(400, { errors: [{ message: 'Bad request' }] }),
    });

    const error = await adapter
      .uploadAttachment?.(new File(['A'], 'a.txt'))
      .catch((value) => value);

    expect(error).not.toBeInstanceOf(ChatAdapterError);
    expect((error as Error).message).toBe('Bad request');
  });

  it('reads stored text, or the stored bytes', async () => {
    const { adapter, calls } = adapterFor({
      'GET /uploads/text-1?depth=0': () =>
        Response.json({ filename: 'a.txt', mimeType: 'text/plain', text: 'stored' }),
      'GET /uploads/image-1?depth=0': () =>
        Response.json({ filename: 'chart one.png', mimeType: 'image/png', filesize: 5 }),
      'GET /uploads/file/chart one.png': () => new Response('bytes'),
    });

    const signal = new AbortController().signal;

    await expect(adapter.readAttachment?.('text-1', { signal })).resolves.toEqual({
      filename: 'a.txt',
      mediaType: 'text/plain',
      text: 'stored',
    });

    const image = await adapter.readAttachment?.('image-1', { signal });

    expect(image).toMatchObject({ filename: 'chart one.png', mediaType: 'image/png', filesize: 5 });
    expect(image && 'blob' in image ? await image.blob.text() : undefined).toBe('bytes');
    expect(calls.map(({ path }) => path)).toEqual([
      '/uploads/text-1?depth=0',
      '/uploads/image-1?depth=0',
      '/uploads/file/chart one.png',
    ]);
  });

  it('transcribes with the model from /frogbot', async () => {
    const { adapter, calls } = adapterFor({
      'POST /v1/audio/transcriptions': () => Response.json({ text: 'hello' }),
    });

    await expect(adapter.transcribe?.(new File(['voice'], 'voice.webm'))).resolves.toBe('hello');
    expect((calls.at(-1)?.body as FormData).get('model')).toBe('openai/whisper-1');
  });

  describe('transport', () => {
    function transportFor(response: () => Response, request = {}) {
      const backend = adapterFor({ 'POST /agents/support': response });
      const onChatId = vi.fn();
      const transport = backend.adapter.createTransport({
        agent: 'support',
        request: () => request,
        onChatId,
      });

      const send = (messages = [message]) =>
        transport.sendMessages({
          trigger: 'submit-message',
          chatId: 'chat',
          messageId: undefined,
          messages,
          abortSignal: undefined,
        });

      return { ...backend, onChatId, send, transport };
    }

    it('posts the turn with the chat id, model and reasoning read at send time', async () => {
      const { calls, send } = transportFor(emptyStream, {
        chatId: 'chat-1',
        model: 'openai/test',
        reasoning: 'high',
      });

      await send();

      expect(calls[0]).toMatchObject({
        method: 'POST',
        path: '/agents/support',
        body: { messages: [message], chatId: 'chat-1', model: 'openai/test', reasoning: 'high' },
      });
      expect(calls[0]?.headers.get('Authorization')).toBe('Bearer runtime');
    });

    it('reports the chat id on every response that carries it, without emitting a mutation', async () => {
      const mutated = vi.fn();

      window.addEventListener(CHAT_MUTATION_EVENT, mutated);

      const { onChatId, send } = transportFor(
        () =>
          new Response(new ReadableStream({ start: (controller) => controller.close() }), {
            headers: { 'X-FrogBot-Chat-Id': 'chat-9' },
          }),
      );

      await send();
      await send();

      expect(onChatId.mock.calls).toEqual([['chat-9'], ['chat-9']]);
      expect(mutated).not.toHaveBeenCalled();

      window.removeEventListener(CHAT_MUTATION_EVENT, mutated);
    });

    it('treats a 499 as an empty stream and never reconnects', async () => {
      const { send, transport } = transportFor(() => new Response(null, { status: 499 }));
      const stream = await send();

      expect((await stream.getReader().read()).done).toBe(true);
      expect(await transport.reconnectToStream({ chatId: 'chat', metadata: undefined })).toBeNull();
    });

    it('refuses inline file data', async () => {
      const { calls, send } = transportFor(emptyStream);

      await expect(
        send([
          {
            id: 'user-1',
            role: 'user',
            parts: [{ type: 'file', mediaType: 'text/plain', url: 'data:text/plain,hi' }],
          },
        ]),
      ).rejects.toThrow('Chat attachments require a stable FrogBot file reference');
      expect(calls).toHaveLength(0);
    });
  });
});
