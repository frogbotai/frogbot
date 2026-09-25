import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  assertAgentAccess,
  assertAllowedModel,
  getAgentAuthorizations,
  getAgentManifest,
  listAgents,
} from '../../../../packages/frogbot/src/agents/service.js';
import type { AgentInstance } from '../../../../packages/frogbot/src/agents/types.js';
import {
  definePiece,
  pieceInstanceTools,
} from '../../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

function makeAgent({
  slug = 'support',
  access,
  allowModels,
}: {
  slug?: string;
  access?: AgentInstance['config']['access'];
  allowModels?: AgentInstance['config']['allowModels'];
} = {}): AgentInstance {
  return {
    slug,
    config: {
      slug,
      model: 'openai/test',
      instructions: 'Help',
      access,
      allowModels,
      tools: [],
    },
    aiAgent: { tools: {} } as unknown as AgentInstance['aiAgent'],
    generate: vi.fn() as AgentInstance['generate'],
    stream: vi.fn() as AgentInstance['stream'],
  };
}

function makeRequest({
  agents,
  authorizations,
}: {
  agents: Record<string, AgentInstance>;
  authorizations?: ReturnType<typeof vi.fn>;
}): FrogBotRequest {
  return {
    user: { id: 'user-1' },
    frogbot: {
      agents,
      connections: authorizations ? { authorizations } : undefined,
    },
  } as unknown as FrogBotRequest;
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

  it('discovers native tool origins through sanitized copies and deduplicates instances', async () => {
    const authorizations = vi.fn().mockResolvedValue([{ piece: 'google-sheets' }]);
    const agent = makeAgent();
    const piece = definePiece({
      slug: 'google-sheets',
      label: 'Sheets',
      actions: ['read', 'write'].map((slug) => ({
        slug,
        description: slug,
        input: z.object({}),
        async run() {},
      })),
    })({ slug: 'work-sheets' });
    agent.config.tools = [
      ...pieceInstanceTools(piece)!.map((tool) => ({ ...tool })),
      ...agent.config.tools,
    ];
    const req = makeRequest({ agents: { support: agent }, authorizations });

    await expect(getAgentAuthorizations({ req, agent })).resolves.toEqual([
      { piece: 'google-sheets' },
    ]);
    expect(authorizations).toHaveBeenCalledWith({
      req,
      pieces: [piece],
    });
  });

  it('returns no override when the caller does not request a model', () => {
    expect(assertAllowedModel({ agent: makeAgent() })).toBeUndefined();
  });

  it.each(['openai/test', 'openai/other'])('returns the allowed model %s', (model) => {
    const agent = makeAgent({ allowModels: ['openai/other'] });

    expect(assertAllowedModel({ agent, model })).toBe(model);
  });

  it('rejects a model outside the agent allowlist with 403', () => {
    const agent = makeAgent({ allowModels: ['openai/other'] });

    expect(() => assertAllowedModel({ agent, model: 'x/test' })).toThrow(
      expect.objectContaining({
        message: "Model 'x/test' is not allowed for agent 'support'",
        status: 403,
      }),
    );
  });
});
