import type { UIMessage, UIMessageChunk } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { AgentInstance } from '../../../../packages/frogbot/src/agents/types.js';
import { TurnError } from '../../../../packages/frogbot/src/chat/turn/errors.js';
import type * as StreamTurnModule from '../../../../packages/frogbot/src/chat/turn/streamTurn.js';
import {
  definePiece,
  pieceInstanceTools,
} from '../../../../packages/frogbot/src/pieces/definePiece.js';
import { question } from '../../../../packages/frogbot/src/tools/question.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

const { listPendingCalls, releaseTurn, resolveChatAttachments, resolveChatContext, streamTurn } =
  vi.hoisted(() => ({
    listPendingCalls: vi.fn(),
    releaseTurn: vi.fn(),
    resolveChatAttachments: vi.fn(),
    resolveChatContext: vi.fn(),
    streamTurn: vi.fn(),
  }));

vi.mock('../../../../packages/frogbot/src/chat/chatContext.js', () => ({ resolveChatContext }));

vi.mock('../../../../packages/frogbot/src/chat/turn/state.js', () => ({ releaseTurn }));

vi.mock('../../../../packages/frogbot/src/chat/turn/settle.js', () => ({ listPendingCalls }));

vi.mock('../../../../packages/frogbot/src/chat/turn/streamTurn.js', async (importOriginal) => ({
  ...(await importOriginal<typeof StreamTurnModule>()),
  streamTurn,
}));

vi.mock('../../../../packages/frogbot/src/uploads/resolveChatAttachments.js', () => ({
  resolveChatAttachments,
}));

const { buildAgentEndpoints } =
  await import('../../../../packages/frogbot/src/agents/endpoints.js');

const claim = { chatId: 'chat-1', attempt: 'attempt-1' };

const history: UIMessage[] = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }];

const pendingCall = {
  toolCallId: 'call-1',
  toolName: 'question',
  input: { questions: [] },
  messageId: 'assistant-1',
  chatId: 'chat-1',
  agentSlug: 'support',
  createdAt: '2026-09-24T00:00:00.000Z',
};

function makeAgent(): AgentInstance {
  return {
    slug: 'support',
    config: { slug: 'support', model: 'openai/test', instructions: 'Help' },
    aiAgent: { tools: {} } as unknown as AgentInstance['aiAgent'],
    generate: vi.fn() as AgentInstance['generate'],
    stream: vi.fn() as AgentInstance['stream'],
  };
}

function makeTurn({ persistence = Promise.resolve() }: { persistence?: Promise<void> } = {}) {
  const chunks: UIMessageChunk[] = [
    { type: 'start', messageId: 'assistant-1' },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: 'hello' },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish' },
  ];

  return {
    result: {
      text: Promise.resolve('hello'),
      totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 2 }),
      finishReason: Promise.resolve('stop'),
    },
    uiMessageStream: new ReadableStream<UIMessageChunk>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));

        controller.close();
      },
    }),
    persistence,
  };
}

function makeRequest({
  accept,
  agent = makeAgent(),
  body = { prompt: 'Hello' },
  authorizations,
  signal,
  slug = 'support',
  user = { id: 'user-1' },
}: {
  accept?: string;
  authorizations?: ReturnType<typeof vi.fn>;
  agent?: AgentInstance;
  body?: unknown;
  signal?: AbortSignal;
  slug?: string;
  user?: { id: string } | null;
} = {}): FrogBotRequest {
  const headers = new Headers({ 'content-type': 'application/json' });

  if (accept) headers.set('accept', accept);

  const request = new Request('http://localhost/api/agents/support', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  return Object.assign(request, {
    routeParams: { slug },
    frogbot: {
      agents: { support: agent },
      connections: authorizations ? { authorizations } : undefined,
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    },
    user,
  }) as unknown as FrogBotRequest;
}

function postHandler() {
  return buildAgentEndpoints().find(
    ({ path, method }) => path === '/agents/:slug' && method === 'post',
  )!.handler;
}

function listHandler() {
  return buildAgentEndpoints().find(({ path, method }) => path === '/agents' && method === 'get')!
    .handler;
}

function authorizationsHandler() {
  return buildAgentEndpoints().find(
    ({ path, method }) => path === '/agents/:slug/authorizations' && method === 'get',
  )!.handler;
}

describe('agent endpoints', () => {
  beforeEach(() => {
    listPendingCalls.mockReset().mockResolvedValue([]);
    releaseTurn.mockReset().mockResolvedValue(true);
    resolveChatAttachments
      .mockReset()
      .mockImplementation(({ messages }) => Promise.resolve(messages));

    resolveChatContext
      .mockReset()
      .mockResolvedValue({ status: 'ready', chatId: 'chat-1', uiMessages: history, claim });

    streamTurn.mockReset().mockImplementation(() => Promise.resolve(makeTurn()));
  });

  it('returns the agent manifest', async () => {
    const agent = makeAgent();
    agent.config = {
      ...agent.config,
      profile: { name: 'Ada', avatar: '/ada.png' },
    } as AgentInstance['config'];
    const response = await listHandler()(makeRequest({ agent }));

    expect(await response.json()).toEqual({
      defaultAgent: 'support',
      agents: [
        {
          slug: 'support',
          label: 'Ada',
          source: 'config',
          defaultModel: 'openai/test',
          models: ['openai/test'],
        },
      ],
    });
  });

  it('returns authorization preflight requirements and requires authentication', async () => {
    const sheets = definePiece({
      slug: 'google-sheets',
      label: 'Google Sheets',
      auth: z.string(),
      client: ({ auth }) => ({ auth }),
      oauth: {
        authorizationUrl: 'https://example.com/authorize',
        tokenUrl: 'https://example.com/token',
        scopes: ['sheets'],
        toAuth: ({ tokens }) => tokens.access_token,
      },
      actions: [
        { slug: 'find', description: 'Find rows', input: z.object({}), run: async () => [] },
      ],
    })({ slug: 'sheets', oauth: { clientId: 'client-id', clientSecret: 'client-secret' } });
    const requirements = [
      { piece: 'google-sheets', oauth: true, secret: false, scopes: ['sheets'] },
    ];
    const authorizations = vi.fn().mockResolvedValue(requirements);
    const agent = makeAgent();
    agent.config.tools = pieceInstanceTools(sheets);
    const req = makeRequest({ agent, authorizations });
    const response = await authorizationsHandler()(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      authorizations: requirements,
    });
    expect(authorizations).toHaveBeenCalledWith({
      pieces: [sheets],
      req,
    });
    authorizations.mockClear();
    const anonymous = await authorizationsHandler()(makeRequest({ user: null, authorizations }));
    expect(anonymous.status).toBe(401);
    expect(authorizations).not.toHaveBeenCalled();
  });

  it('resolves the chat context from the prompt, chat id, and delivery', async () => {
    const agent = makeAgent();
    const req = makeRequest({
      agent,
      body: { prompt: 'Hello', chatId: 'chat-1', delivery: 'steer' },
    });

    await postHandler()(req);

    expect(resolveChatContext).toHaveBeenCalledWith({
      req,
      agentSlug: 'support',
      chatId: 'chat-1',
      incoming: [
        { id: expect.any(String), role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
      ],
      tools: agent.aiAgent.tools,
      delivery: 'steer',
    });
  });

  it('returns a completed JSON result after the turn is persisted', async () => {
    const persisted = Promise.withResolvers<void>();

    streamTurn.mockResolvedValue(makeTurn({ persistence: persisted.promise }));

    const pending = postHandler()(makeRequest({ accept: 'text/plain' }));

    await vi.waitFor(() => expect(streamTurn).toHaveBeenCalledOnce());

    expect(listPendingCalls).not.toHaveBeenCalled();

    persisted.resolve();

    const response = await pending;

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      status: 'completed',
      text: 'hello',
      usage: { inputTokens: 1, outputTokens: 2 },
      finishReason: 'stop',
      authorizations: [],
      chatId: 'chat-1',
    });
  });

  it('reports pending client tool calls as awaiting input', async () => {
    listPendingCalls.mockResolvedValue([pendingCall]);

    const req = makeRequest();
    const response = await postHandler()(req);

    expect(listPendingCalls).toHaveBeenCalledWith({ req, chatId: 'chat-1' });
    expect(await response.json()).toMatchObject({
      status: 'awaiting-input',
      chatId: 'chat-1',
      pending: [pendingCall],
    });
  });

  it('fails JSON requests on stream errors instead of encoding them as chunks', async () => {
    const req = makeRequest();

    await postHandler()(req);

    const { onError } = streamTurn.mock.calls[0]![0] as { onError?: (error: unknown) => string };
    const failure = new Error('model failed');

    expect(() => onError?.(failure)).toThrow(failure);
  });

  it('rejects the JSON response when the turn fails to persist', async () => {
    streamTurn.mockResolvedValue(
      makeTurn({ persistence: Promise.reject(Object.assign(new Error('lost'), { status: 409 })) }),
    );

    const response = await postHandler()(makeRequest());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'lost' });
  });

  it('streams the turn for an explicit text/event-stream media range', async () => {
    const response = await postHandler()(
      makeRequest({ accept: 'application/json, text/event-stream; q=1' }),
    );

    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('X-FrogBot-Chat-Id')).toBe('chat-1');
    expect(await response.text()).toContain(
      'data: {"type":"text-delta","id":"text-1","delta":"hello"}',
    );
    expect(streamTurn).toHaveBeenCalledWith(
      expect.not.objectContaining({ onError: expect.anything() }),
    );
    expect(listPendingCalls).not.toHaveBeenCalled();
  });

  it('runs the claimed turn with every client tool kind and the request signal', async () => {
    const controller = new AbortController();
    const agent = makeAgent();
    agent.config.tools = [question];
    const req = makeRequest({ agent, signal: controller.signal });

    await postHandler()(req);

    expect(streamTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        agent,
        claim,
        uiMessages: history,
        providerMessages: history,
        model: undefined,
        clientTools: { kinds: ['question'] },
        abortSignal: req.signal,
      }),
    );
  });

  it('rejects malformed UI messages with 400', async () => {
    const response = await postHandler()(
      makeRequest({
        body: { messages: [{ role: 'user' }] },
      }),
    );

    expect(response.status).toBe(400);
    expect(resolveChatContext).not.toHaveBeenCalled();
  });

  it('rejects a model outside the agent allowlist', async () => {
    const response = await postHandler()(
      makeRequest({ body: { prompt: 'Hello', model: 'x/test' } }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Model 'x/test' is not allowed for agent 'support'",
    });
    expect(resolveChatContext).not.toHaveBeenCalled();
  });

  it('passes an allowed model to the turn', async () => {
    const agent = makeAgent();
    agent.config.allowModels = ['openai/other'];
    const response = await postHandler()(
      makeRequest({ agent, body: { prompt: 'Hello', model: 'openai/other' } }),
    );

    expect(response.status).toBe(200);
    expect(streamTurn).toHaveBeenCalledWith(expect.objectContaining({ model: 'openai/other' }));
  });

  it('accepts stable file references and resolves them for the provider only', async () => {
    const parts = [
      { type: 'text', text: 'Read' },
      { type: 'file-reference', id: 'file-1', filename: 'client.txt', mediaType: 'text/plain' },
    ] as UIMessage['parts'];
    const uiMessages: UIMessage[] = [{ id: 'one', role: 'user', parts }];
    const resolved: UIMessage[] = [
      {
        id: 'one',
        role: 'user',
        parts: [
          { type: 'text', text: 'Read' },
          { type: 'file', mediaType: 'text/plain', url: 'data:text/plain;base64,ZmlsZQ==' },
        ],
      },
    ];

    resolveChatContext.mockResolvedValue({ status: 'ready', chatId: 'chat-1', uiMessages, claim });
    resolveChatAttachments.mockResolvedValue(resolved);

    const request = makeRequest({
      accept: 'text/event-stream',
      body: { messages: uiMessages },
    });

    await postHandler()(request);

    expect(resolveChatContext).toHaveBeenCalledWith(
      expect.objectContaining({ incoming: [expect.objectContaining({ parts })] }),
    );
    expect(resolveChatAttachments).toHaveBeenCalledWith({
      req: request,
      messages: uiMessages,
      chatId: 'chat-1',
    });
    expect(streamTurn).toHaveBeenCalledWith(
      expect.objectContaining({ uiMessages, providerMessages: resolved }),
    );
  });

  it('releases the claimed turn when attachments cannot be resolved', async () => {
    resolveChatAttachments.mockRejectedValue(
      Object.assign(new Error('missing file'), { status: 404 }),
    );

    const req = makeRequest();
    const response = await postHandler()(req);

    expect(response.status).toBe(404);
    expect(releaseTurn).toHaveBeenCalledWith({ req, claim, state: 'idle' });
    expect(streamTurn).not.toHaveBeenCalled();
  });

  it('returns 202 with the queued message when the chat is busy', async () => {
    resolveChatContext.mockResolvedValue({
      status: 'queued',
      chatId: 'chat-1',
      messageId: 'u1',
      delivery: 'queue',
    });

    const response = await postHandler()(makeRequest({ body: { prompt: 'Hi', chatId: 'chat-1' } }));

    expect(response.status).toBe(202);
    expect(response.headers.get('X-FrogBot-Chat-Id')).toBe('chat-1');
    expect(await response.json()).toEqual({
      status: 'queued',
      chatId: 'chat-1',
      messageId: 'u1',
      delivery: 'queue',
    });
    expect(streamTurn).not.toHaveBeenCalled();
  });

  it('streams a transient queued chunk when the chat is busy', async () => {
    resolveChatContext.mockResolvedValue({
      status: 'queued',
      chatId: 'chat-1',
      messageId: 'u1',
      delivery: 'steer',
    });

    const response = await postHandler()(
      makeRequest({ accept: 'text/event-stream', body: { prompt: 'Hi', chatId: 'chat-1' } }),
    );

    expect(response.headers.get('X-FrogBot-Chat-Id')).toBe('chat-1');
    expect(await response.text()).toContain(
      'data: {"type":"data-queued","data":{"messageId":"u1","delivery":"steer"},"transient":true}',
    );
    expect(streamTurn).not.toHaveBeenCalled();
  });

  it('preserves safe status values from agent errors', async () => {
    streamTurn.mockRejectedValue(Object.assign(new Error('denied'), { statusCode: 403 }));

    const response = await postHandler()(makeRequest());

    expect(response.status).toBe(403);
  });

  it('returns the turn error code with its status', async () => {
    resolveChatContext.mockRejectedValue(
      new TurnError('turn-in-progress', 'This chat already has a turn in progress.'),
    );

    const response = await postHandler()(makeRequest({ body: { prompt: 'Hi', chatId: 'chat-1' } }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'This chat already has a turn in progress.',
      code: 'turn-in-progress',
    });
  });

  it('propagates chat load failures as their status', async () => {
    resolveChatContext.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));

    const response = await postHandler()(
      makeRequest({ body: { prompt: 'Hello', chatId: 'gone' } }),
    );

    expect(response.status).toBe(404);
    expect(streamTurn).not.toHaveBeenCalled();
  });

  it('checks agent access before resolving the chat', async () => {
    const agent = makeAgent();
    agent.config.access = () => false;

    const response = await postHandler()(
      makeRequest({ agent, user: null, body: { prompt: 'Hello', chatId: 'chat-7' } }),
    );

    expect(response.status).toBe(403);
    expect(resolveChatContext).not.toHaveBeenCalled();
    expect(streamTurn).not.toHaveBeenCalled();
  });

  it('runs anonymous turns after agent access succeeds', async () => {
    const agent = makeAgent();
    agent.config.access = () => true;

    const response = await postHandler()(makeRequest({ agent, user: null }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ chatId: 'chat-1', authorizations: [] });
  });

  it('returns a bodyless 499 when the inbound request is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    streamTurn.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    const response = await postHandler()(makeRequest({ signal: controller.signal }));

    expect(response.status).toBe(499);
    expect(await response.text()).toBe('');
  });

  it('returns 404 for unknown agent slugs', async () => {
    const response = await postHandler()(makeRequest({ slug: 'missing' }));
    expect(response.status).toBe(404);
  });
});
