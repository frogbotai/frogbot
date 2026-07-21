import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AI from 'ai';

import type { AgentInstance } from '../types/agent.js';
import type { FrogbotRequest } from '../types/request.js';

const { createAgentUIStreamResponse } = vi.hoisted(() => ({
  createAgentUIStreamResponse: vi.fn(() => Promise.resolve(new Response('stream'))),
}));

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof AI>()),
  createAgentUIStreamResponse,
}));

const { buildAgentEndpoints } = await import('./endpoints.js');

function makeAgent(
  generate = vi.fn(() =>
    Promise.resolve({
      text: 'hello',
      totalUsage: { inputTokens: 1, outputTokens: 2 },
      finishReason: 'stop',
    }),
  ),
): AgentInstance {
  return {
    slug: 'support',
    config: { slug: 'support', model: 'openai/test', instructions: 'Help' },
    aiAgent: { tools: {} } as AgentInstance['aiAgent'],
    generate: generate as AgentInstance['generate'],
    stream: vi.fn() as AgentInstance['stream'],
  };
}

function makeRequest({
  accept,
  agent = makeAgent(),
  body = { prompt: 'Hello' },
  create = vi.fn(() => Promise.resolve({ id: 'thread-1' })),
  find = vi.fn(() =>
    Promise.resolve({
      docs: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
    }),
  ),
  findByID = vi.fn(() => Promise.resolve({ id: 'thread-1' })),
  signal,
  slug = 'support',
  user = { id: 'user-1' },
}: {
  accept?: string;
  agent?: AgentInstance;
  body?: unknown;
  create?: ReturnType<typeof vi.fn>;
  find?: ReturnType<typeof vi.fn>;
  findByID?: ReturnType<typeof vi.fn>;
  signal?: AbortSignal;
  slug?: string;
  user?: { id: string } | null;
} = {}): FrogbotRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (accept) {
    headers.set('accept', accept);
  }
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
      config: { chat: { enabled: true, threadsSlug: 'threads', messagesSlug: 'messages' } },
      create,
      find,
      findByID,
    },
    payload: { db: {} },
    user,
  }) as unknown as FrogbotRequest;
}

function postHandler() {
  return buildAgentEndpoints()[0].handler;
}

describe('agent endpoints', () => {
  beforeEach(() => {
    createAgentUIStreamResponse.mockClear();
  });

  it('returns JSON unless text/event-stream is explicitly accepted', async () => {
    const agent = makeAgent();
    const response = await postHandler()(makeRequest({ agent, accept: 'text/plain' }));

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(agent.generate).toHaveBeenCalledOnce();
    expect(createAgentUIStreamResponse).not.toHaveBeenCalled();
  });

  it('streams for an explicit text/event-stream media range', async () => {
    const response = await postHandler()(
      makeRequest({
        accept: 'application/json, text/event-stream; q=1',
      }),
    );

    expect(await response.text()).toBe('stream');
    expect(createAgentUIStreamResponse).toHaveBeenCalledOnce();
  });

  it('rejects malformed UI messages with 400', async () => {
    const response = await postHandler()(
      makeRequest({
        body: { messages: [{ role: 'user' }] },
      }),
    );

    expect(response.status).toBe(400);
  });

  it('preserves safe status values from agent errors', async () => {
    const generate = vi.fn(() => Promise.reject(Object.assign(new Error('denied'), { statusCode: 403 })));
    const response = await postHandler()(makeRequest({ agent: makeAgent(generate) }));

    expect(response.status).toBe(403);
  });

  it('returns a bodyless 499 when the inbound request is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const generate = vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError')));
    const response = await postHandler()(
      makeRequest({
        agent: makeAgent(generate),
        signal: controller.signal,
      }),
    );

    expect(response.status).toBe(499);
    expect(await response.text()).toBe('');
  });

  it('returns 404 for unknown agent slugs', async () => {
    const response = await postHandler()(makeRequest({ slug: 'missing' }));
    expect(response.status).toBe(404);
  });

  it('creates a thread and echoes threadId in the JSON body', async () => {
    const create = vi.fn(() => Promise.resolve({ id: 'thread-9' }));
    const request = makeRequest({ create });
    const response = await postHandler()(request);

    expect(create).toHaveBeenCalledWith({
      collection: 'threads',
      data: { user: 'user-1', agent: 'support' },
      req: request,
      overrideAccess: false,
    });
    expect(await response.json()).toMatchObject({ threadId: 'thread-9' });
  });

  it('sets X-Frogbot-Thread-Id on streamed responses', async () => {
    const create = vi.fn(() => Promise.resolve({ id: 'thread-9' }));
    await postHandler()(makeRequest({ create, accept: 'text/event-stream' }));

    expect(createAgentUIStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { 'X-Frogbot-Thread-Id': 'thread-9' } }),
    );
  });

  it('loads an existing thread with overrideAccess false and echoes its id', async () => {
    const create = vi.fn(() => Promise.resolve({ id: 'msg-1' }));
    const findByID = vi.fn(() => Promise.resolve({ id: 'thread-7' }));
    const request = makeRequest({ create, findByID, body: { prompt: 'Hello', threadId: 'thread-7' } });
    const response = await postHandler()(request);

    expect(findByID).toHaveBeenCalledWith({
      collection: 'threads',
      id: 'thread-7',
      req: request,
      overrideAccess: false,
    });
    expect(create).not.toHaveBeenCalledWith(expect.objectContaining({ collection: 'threads' }));
    expect(await response.json()).toMatchObject({ threadId: 'thread-7' });
  });

  it('propagates thread load failures as their status', async () => {
    const findByID = vi.fn(() => Promise.reject(Object.assign(new Error('not found'), { status: 404 })));
    const response = await postHandler()(makeRequest({ findByID, body: { prompt: 'Hello', threadId: 'gone' } }));

    expect(response.status).toBe(404);
  });

  it('runs stateless for anonymous callers without touching threads', async () => {
    const create = vi.fn();
    const find = vi.fn();
    const findByID = vi.fn();
    const response = await postHandler()(makeRequest({ create, find, findByID, user: null }));

    expect(create).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
    expect(findByID).not.toHaveBeenCalled();
    expect(await response.json()).not.toHaveProperty('threadId');
  });

  it('persists the user message and runs the agent on server history', async () => {
    const agent = makeAgent();
    const create = vi.fn(() => Promise.resolve({ id: 'thread-9' }));
    const find = vi.fn(() =>
      Promise.resolve({
        docs: [
          { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Earlier' }] },
          { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Reply' }] },
          { id: 'm3', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
        ],
      }),
    );
    const request = makeRequest({ agent, create, find });
    await postHandler()(request);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'messages',
        data: expect.objectContaining({
          thread: 'thread-9',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
        }),
        overrideAccess: false,
      }),
    );
    expect(create.mock.invocationCallOrder[0]).toBeLessThan((agent.generate as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
    expect(agent.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({ id: 'm1', role: 'user' }),
          expect.objectContaining({ id: 'm2', role: 'assistant' }),
          expect.objectContaining({ id: 'm3', role: 'user' }),
        ],
      }),
    );
  });

  it('rejects anonymous requests that supply a threadId', async () => {
    const response = await postHandler()(makeRequest({ user: null, body: { prompt: 'Hello', threadId: 'thread-7' } }));

    expect(response.status).toBe(401);
  });
});
