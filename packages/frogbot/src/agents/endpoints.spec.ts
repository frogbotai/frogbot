import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AI from 'ai';

import type { InternalAgentInstance } from '../types/agent.js';
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
): InternalAgentInstance {
  return {
    slug: 'support',
    config: { slug: 'support', model: 'openai/test', instructions: 'Help' },
    aiAgent: { tools: {} } as InternalAgentInstance['aiAgent'],
    generate: generate as InternalAgentInstance['generate'],
    stream: vi.fn() as InternalAgentInstance['stream'],
  };
}

function makeRequest({
  accept,
  agent = makeAgent(),
  body = { prompt: 'Hello' },
  signal,
  slug = 'support',
}: {
  accept?: string;
  agent?: InternalAgentInstance;
  body?: unknown;
  signal?: AbortSignal;
  slug?: string;
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
    frogbot: { agents: { support: agent } },
    user: { id: 'user-1' },
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
});
