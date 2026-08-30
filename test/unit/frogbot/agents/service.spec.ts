import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import type { AgentInstance } from '../../../../packages/frogbot/src/agents/types.js';
import type { FrogbotRequest } from '../../../../packages/frogbot/src/types/request.js';
import {
  assertAgentAccess,
  generateAgentRequest,
  getAgentAuthorizations,
  getAgentManifest,
  listAgents,
} from '../../../../packages/frogbot/src/agents/service.js';

function makeAgent({
  slug = 'support',
  access,
  allowModels,
}: {
  slug?: string;
  access?: AgentInstance['config']['access'];
  allowModels?: AgentInstance['config']['allowModels'];
} = {}): AgentInstance {
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
      allowModels,
      tools: [{ slug: 'google-sheets_find', pieceService: 'google-sheets' } as never],
    },
    aiAgent: { tools: {}, generate } as unknown as AgentInstance['aiAgent'],
    generate: generate as AgentInstance['generate'],
    stream: vi.fn() as AgentInstance['stream'],
  };
}

function makeRequest({
  agents,
  authorizations,
  create = vi.fn(),
}: {
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
      config: {
        ai: { routers: {} },
        chat: { enabled: true, chatsSlug: 'chats', messagesSlug: 'messages' },
      },
      create,
      findByID: vi.fn(() => Promise.resolve({ id: 'chat-1', title: null })),
      generateText: vi.fn(() => Promise.resolve({ text: 'Chat title' })),
      logger: { error: vi.fn() },
      update: vi.fn(() => Promise.resolve({ id: 'chat-1' })),
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
    await expect(
      assertAgentAccess({ req, agent: req.frogbot.agents.broken }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('passes the agent instance to access functions', async () => {
    const access = vi.fn(({ agent }: { agent: AgentInstance }) => agent.slug === 'support');
    const support = makeAgent({ access });
    const req = makeRequest({ agents: { support } });

    await expect(assertAgentAccess({ req, agent: support })).resolves.toBeUndefined();
    expect(access).toHaveBeenCalledWith({ req, agent: support });
  });

  it('builds a permission-filtered agent manifest', async () => {
    const req = makeRequest({
      agents: {
        support: makeAgent({ allowModels: ['openai/other', 'openai/test'] }),
        denied: makeAgent({ slug: 'denied', access: () => false }),
      },
    });

    await expect(getAgentManifest({ req })).resolves.toEqual({
      defaultAgent: 'support',
      agents: [
        {
          slug: 'support',
          label: 'support',
          source: 'config',
          defaultModel: 'openai/test',
          models: ['openai/test', 'openai/other'],
        },
      ],
    });
  });

  it('resolves authorization services from agent tools', async () => {
    const authorizations = vi.fn().mockResolvedValue([{ source: 'google' }]);
    const agent = makeAgent();
    const req = makeRequest({ agents: { support: agent }, authorizations });

    await expect(getAgentAuthorizations({ req, agent })).resolves.toEqual([{ source: 'google' }]);
    expect(authorizations).toHaveBeenCalledWith({
      owner: { id: 'user-1' },
      services: ['google-sheets'],
    });
  });

  it('generates from UI messages and persists the assistant message', async () => {
    const create = vi.fn(() => Promise.resolve({ id: 'assistant-1' }));
    const agent = makeAgent();
    const req = makeRequest({ agents: { support: agent }, create });
    const uiMessages: UIMessage[] = [
      { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
    ];

    const result = await generateAgentRequest({ req, agent, chatId: 'chat-1', uiMessages });

    expect(result.text).toBe('hello');
    expect(agent.aiAgent.generate).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ chatId: 'chat-1' }) }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'messages',
        data: expect.objectContaining({
          chat: 'chat-1',
          role: 'assistant',
          parts: expect.arrayContaining([expect.objectContaining({ type: 'text', text: 'hello' })]),
        }),
      }),
    );
  });
});
