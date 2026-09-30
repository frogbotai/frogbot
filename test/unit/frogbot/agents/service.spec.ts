import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  assertAgentAccess,
  assertAgentSelection,
  canUseAgent,
  getAgentAuthorizations,
  getAgentManifest,
  listAgents,
} from '../../../../packages/frogbot/src/agents/service.js';
import type { AgentInstance } from '../../../../packages/frogbot/src/agents/types.js';
import type { SanitizedAIConfig } from '../../../../packages/frogbot/src/ai/types.js';
import {
  definePiece,
  pieceInstanceTools,
} from '../../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

const config = {
  providers: {
    openai: true,
    'my-local': {
      type: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      models: [
        {
          id: 'thinker',
          mode: 'chat',
          reasoningOptions: [{ type: 'effort', values: ['low', 'high'] }],
        },
        { id: 'plain', mode: 'chat' },
      ],
    },
  },
  routers: { smart: { model: 'openai/gpt-5' } },
} as unknown as SanitizedAIConfig;

function makeAgent({
  slug = 'support',
  model = 'openai/test',
  access,
  allowModels,
}: {
  slug?: string;
  model?: AgentInstance['config']['model'];
  access?: AgentInstance['config']['access'];
  allowModels?: AgentInstance['config']['allowModels'];
} = {}): AgentInstance {
  return {
    slug,
    config: {
      slug,
      model,
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
  user = { id: 'user-1' },
}: {
  agents: Record<string, AgentInstance>;
  authorizations?: ReturnType<typeof vi.fn>;
  user?: { id: string; modelAccess?: 'all' | 'selected'; models?: string[] } | null;
}): FrogBotRequest {
  return {
    user,
    frogbot: {
      agents,
      config: { ai: config },
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

  it('filters manifest models in agent order rather than allowlist order', async () => {
    const req = makeRequest({
      agents: {
        support: makeAgent({ allowModels: ['openai/other', 'my-local/plain'] }),
      },
      user: { id: 'user-1', modelAccess: 'selected', models: ['my-local/plain', 'openai/test'] },
    });

    const manifest = await getAgentManifest({ req });

    expect(manifest.agents[0]!.models).toEqual(['openai/test', 'my-local/plain']);
    expect(manifest.agents[0]!.defaultModel).toBe('openai/test');
  });

  it('falls back to the first allowed model when the default is blocked', async () => {
    const req = makeRequest({
      agents: {
        support: makeAgent({ allowModels: ['openai/other', 'my-local/plain'] }),
      },
      user: { id: 'user-1', modelAccess: 'selected', models: ['my-local/plain', 'openai/other'] },
    });

    const manifest = await getAgentManifest({ req });

    expect(manifest.agents[0]!.defaultModel).toBe('openai/other');
  });

  it('omits agents with no allowed models', async () => {
    const req = makeRequest({
      agents: { support: makeAgent() },
      user: { id: 'user-1', modelAccess: 'selected', models: [] },
    });

    await expect(getAgentManifest({ req })).resolves.toEqual({ defaultAgent: '', agents: [] });
  });

  it('drops reasoning for blocked models', async () => {
    const req = makeRequest({
      agents: { support: makeAgent({ allowModels: ['smart', 'my-local/thinker'] }) },
      user: { id: 'user-1', modelAccess: 'selected', models: ['my-local/thinker'] },
    });

    const manifest = await getAgentManifest({ req });

    expect(Object.keys(manifest.agents[0]!.reasoning ?? {})).toEqual(['my-local/thinker']);
  });

  it.each([
    { id: 'user-1', modelAccess: 'all' as const, models: ['openai/other'] },
    { id: 'user-1' },
    null,
  ])('preserves the unrestricted manifest for user %o', async (user) => {
    const req = makeRequest({
      agents: { support: makeAgent({ allowModels: ['openai/other'], access: () => true }) },
      user,
    });

    const manifest = await getAgentManifest({ req });

    expect(manifest.agents[0]).toEqual({
      slug: 'support',
      label: 'support',
      source: 'config',
      defaultModel: 'openai/test',
      models: ['openai/test', 'openai/other'],
    });
  });

  it('applies legacy model lists without a modelAccess field', async () => {
    const req = makeRequest({
      agents: { support: makeAgent({ allowModels: ['openai/other'] }) },
      user: { id: 'user-1', models: ['openai/other'] },
    });

    const manifest = await getAgentManifest({ req });

    expect(manifest.agents[0]!.models).toEqual(['openai/other']);
  });

  it('accepts an offered model allowed for the user', () => {
    const agent = makeAgent({ allowModels: ['openai/other'] });
    const user = makeRequest({ agents: {}, user: { id: 'user-1', models: ['openai/other'] } }).user;

    expect(
      assertAgentSelection({ agent, config, selection: { model: 'openai/other' }, user }),
    ).toEqual({ model: 'openai/other' });
  });

  it('rejects an offered but user-blocked model before checking reasoning', () => {
    const agent = makeAgent({ allowModels: ['my-local/thinker'] });
    const user = makeRequest({ agents: {}, user: { id: 'user-1', models: ['openai/test'] } }).user;

    expect(() =>
      assertAgentSelection({
        agent,
        config,
        selection: { model: 'my-local/thinker', reasoning: 'invalid' },
        user,
      }),
    ).toThrow(
      expect.objectContaining({
        message: "Model 'my-local/thinker' is not allowed for this user",
        status: 403,
      }),
    );
  });

  it('keeps the agent error first for a model blocked by both checks', () => {
    const agent = makeAgent();
    const user = makeRequest({
      agents: {},
      user: { id: 'user-1', modelAccess: 'selected', models: [] },
    }).user;

    expect(() =>
      assertAgentSelection({ agent, config, selection: { model: 'my-local/thinker' }, user }),
    ).toThrow(
      expect.objectContaining({
        message: "Model 'my-local/thinker' is not allowed for agent 'support'",
        status: 403,
      }),
    );
  });

  it('resolves the user fallback and its reasoning when no model is named', () => {
    const agent = makeAgent({ allowModels: ['my-local/thinker'] });
    const user = makeRequest({
      agents: {},
      user: { id: 'user-1', models: ['my-local/thinker'] },
    }).user;

    expect(
      assertAgentSelection({ agent, config, selection: { reasoning: 'low' }, user }),
    ).toMatchObject({ model: 'my-local/thinker', variant: { key: 'low' } });
  });

  it('rejects an unnamed model when none are allowed for the user', () => {
    const agent = makeAgent();
    const user = makeRequest({
      agents: {},
      user: { id: 'user-1', modelAccess: 'selected', models: [] },
    }).user;

    expect(() => assertAgentSelection({ agent, config, selection: {}, user })).toThrow(
      expect.objectContaining({
        message: "No model on agent 'support' is allowed for this user",
        status: 403,
      }),
    );
  });

  it.each([
    ['smart', 'openai/gpt-5'],
    ['openai/gpt-5', 'smart'],
  ] as const)('does not unlock %s by allowlisting %s', (model, allowed) => {
    const agent = makeAgent({ allowModels: ['smart', 'openai/gpt-5'] });
    const user = makeRequest({ agents: {}, user: { id: 'user-1', models: [allowed] } }).user;

    expect(() => assertAgentSelection({ agent, config, selection: { model }, user })).toThrow(
      expect.objectContaining({
        message: `Model '${model}' is not allowed for this user`,
        status: 403,
      }),
    );
    expect(assertAgentSelection({ agent, config, selection: { model: allowed }, user })).toEqual({
      model: 'openai/gpt-5',
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

  it('advertises the reasoning options of routers and custom models, leaving out the rest', async () => {
    const req = makeRequest({
      agents: {
        support: makeAgent({ allowModels: ['smart', 'my-local/thinker', 'my-local/plain'] }),
      },
    });

    const manifest = await getAgentManifest({ req });

    expect(Object.keys(manifest.agents[0]!.reasoning ?? {})).toEqual(['smart', 'my-local/thinker']);
    expect(manifest.agents[0]!.reasoning?.['my-local/thinker']).toEqual([
      { key: 'low', label: 'Low' },
      { key: 'high', label: 'High' },
    ]);
    expect(manifest.agents[0]!.reasoning?.smart).toEqual(
      expect.arrayContaining([{ key: 'high', label: 'High' }]),
    );
  });

  it('resolves the agent default model without reasoning when nothing is selected', () => {
    expect(assertAgentSelection({ agent: makeAgent(), config, selection: {}, user: null })).toEqual(
      {
        model: 'openai/test',
      },
    );
  });

  it.each(['openai/test', 'openai/other'] as const)('resolves the allowed model %s', (model) => {
    const agent = makeAgent({ allowModels: ['openai/other'] });

    expect(assertAgentSelection({ agent, config, selection: { model }, user: null })).toEqual({
      model,
    });
  });

  it('resolves a router to its model and the model reasoning variant', () => {
    const agent = makeAgent({ allowModels: ['smart', 'openai/gpt-5'] });

    const router = assertAgentSelection({
      agent,
      config,
      selection: { model: 'smart', reasoning: 'high' },
      user: null,
    });

    const direct = assertAgentSelection({
      agent,
      config,
      selection: { model: 'openai/gpt-5', reasoning: 'high' },
      user: null,
    });

    expect(router).toEqual(direct);
    expect(router).toMatchObject({
      model: 'openai/gpt-5',
      variant: { key: 'high', providerOptions: { openai: { reasoningEffort: 'high' } } },
    });
  });

  it('sends a custom model variant under the camel-cased provider key', () => {
    const agent = makeAgent({ allowModels: ['my-local/thinker'] });

    expect(
      assertAgentSelection({
        agent,
        config,
        selection: { model: 'my-local/thinker', reasoning: 'low' },
        user: null,
      }),
    ).toEqual({
      model: 'my-local/thinker',
      variant: {
        key: 'low',
        label: 'Low',
        providerOptions: { myLocal: { reasoningEffort: 'low' } },
      },
    });
  });

  it('checks a reasoning option against the agent default model when no model is selected', () => {
    const agent = makeAgent({ model: 'my-local/thinker', allowModels: ['openai/gpt-5'] });

    expect(() =>
      assertAgentSelection({ agent, config, selection: { reasoning: 'medium' }, user: null }),
    ).toThrow(
      expect.objectContaining({
        message: "Reasoning option 'medium' is not available for model 'my-local/thinker'",
        status: 400,
      }),
    );
  });

  it('rejects a reasoning option for a model without reasoning options with 400', () => {
    const agent = makeAgent({ allowModels: ['my-local/plain'] });

    expect(() =>
      assertAgentSelection({
        agent,
        config,
        selection: { model: 'my-local/plain', reasoning: 'high' },
        user: null,
      }),
    ).toThrow(
      expect.objectContaining({
        message: "Reasoning option 'high' is not available for model 'my-local/plain'",
        status: 400,
      }),
    );
  });

  it('rejects a model outside the agent allowlist with 403 before checking reasoning', () => {
    const agent = makeAgent({ allowModels: ['openai/other'] });

    expect(() =>
      assertAgentSelection({
        agent,
        config,
        selection: { model: 'my-local/thinker', reasoning: 'high' },
        user: null,
      }),
    ).toThrow(
      expect.objectContaining({
        message: "Model 'my-local/thinker' is not allowed for agent 'support'",
        status: 403,
      }),
    );
  });

  it('denies agent use by access before checking models', async () => {
    const agent = makeAgent({ access: () => false });
    const req = makeRequest({
      agents: { support: agent },
      user: { id: 'user-1', modelAccess: 'selected', models: [] },
    });

    await expect(canUseAgent({ req, agent })).resolves.toEqual({
      allowed: false,
      denied: 'access',
    });
  });

  it('denies agent use when the user has no usable model', async () => {
    const agent = makeAgent();
    const req = makeRequest({
      agents: { support: agent },
      user: { id: 'user-1', modelAccess: 'selected', models: ['openai/other'] },
    });

    await expect(canUseAgent({ req, agent })).resolves.toEqual({
      allowed: false,
      denied: 'models',
    });
  });

  it('allows agent use when only a fallback model is usable', async () => {
    const agent = makeAgent({ allowModels: ['openai/other'] });
    const req = makeRequest({
      agents: { support: agent },
      user: { id: 'user-1', modelAccess: 'selected', models: ['openai/other'] },
    });

    await expect(canUseAgent({ req, agent })).resolves.toEqual({ allowed: true });
  });
});
