import { describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';

import type { AgentInstance } from '../types/agent.js';
import type { FrogbotRequest } from '../types/request.js';
import { assertAgentAccess, generateAgentRequest, getAgentAuthorizations, listAgents } from './service.js';

function makeAgent({ slug = 'support', access }: { slug?: string; access?: AgentInstance['config']['access'] } = {}): AgentInstance {
  const generate = vi.fn(() =>
    Promise.resolve({
      text: 'hello',
      totalUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      finishReason: 'stop',
      rawFinishReason: 'stop',
      steps: [{ content: [{ type: 'text', text: 'hello' }] }],
    }),
  );
  return {
    slug,
    config: {
      slug,
      model: 'openai/test',
      instructions: 'Help',
      access,
      tools: [{ slug: 'google-sheets_find', pieceService: 'google-sheets' } as never],
    },
    aiAgent: { tools: {}, generate } as unknown as AgentInstance['aiAgent'],
    generate: generate as AgentInstance['generate'],
    stream: vi.fn() as AgentInstance['stream'],
  };
}

function makeRequest({ agents, authorizations, create = vi.fn() }: {
  agents: Record<string, AgentInstance>;
  authorizations?: ReturnType<typeof vi.fn>;
  create?: ReturnType<typeof vi.fn>;
}): FrogbotRequest {
  return {
    user: { id: 'user-1' },
    signal: undefined,
    frogbot: {
      agents,
      connections: authorizations ? { authorizations } : undefined,
      config: { ai: { routers: {} }, chat: { enabled: true, threadsSlug: 'threads', messagesSlug: 'messages' } },
      create,
      update: vi.fn(() => Promise.resolve({ id: 'thread-1' })),
    },
  } as unknown as FrogbotRequest;
}

describe('agent service', () => {
  it('lists only accessible agents and treats access errors as denied', async () => {
    const req = makeRequest({
      agents: {
        support: makeAgent(),
        public: makeAgent({ slug: 'public', access: () => true }),
        broken: makeAgent({ slug: 'broken', access: () => Promise.reject(new Error('broken')) }),
      },
    });

    await expect(listAgents({ req })).resolves.toEqual([{ slug: 'support' }, { slug: 'public' }]);
    await expect(assertAgentAccess({ req, agent: req.frogbot.agents.broken })).rejects.toMatchObject({ status: 403 });
  });

  it('resolves authorization services from agent tools', async () => {
    const authorizations = vi.fn().mockResolvedValue([{ source: 'google' }]);
    const agent = makeAgent();
    const req = makeRequest({ agents: { support: agent }, authorizations });

    await expect(getAgentAuthorizations({ req, agent })).resolves.toEqual([{ source: 'google' }]);
    expect(authorizations).toHaveBeenCalledWith({ owner: { id: 'user-1' }, services: ['google-sheets'] });
  });

  it('generates from UI messages and persists the assistant message', async () => {
    const create = vi.fn(() => Promise.resolve({ id: 'assistant-1' }));
    const agent = makeAgent();
    const req = makeRequest({ agents: { support: agent }, create });
    const uiMessages: UIMessage[] = [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }];

    const result = await generateAgentRequest({ req, agent, threadId: 'thread-1', uiMessages });

    expect(result.text).toBe('hello');
    expect(agent.aiAgent.generate).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ threadId: 'thread-1' }) }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'messages',
        data: expect.objectContaining({
          thread: 'thread-1',
          role: 'assistant',
          parts: expect.arrayContaining([expect.objectContaining({ type: 'text', text: 'hello' })]),
        }),
      }),
    );
  });
});
