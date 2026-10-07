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
import type {
  AgentConfig,
  AgentInstance,
  AgentModelId,
} from '../../../../packages/frogbot/src/agents/types.js';
import type { SanitizedAIConfig } from '../../../../packages/frogbot/src/ai/types.js';
import { sanitize as sanitizeConfig } from '../../../../packages/frogbot/src/config/sanitize.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import {
  definePiece,
  pieceInstanceTools,
} from '../../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

const OPENAI_TEST = 'openai/test' as AgentModelId;
const OPENAI_OTHER = 'openai/other' as AgentModelId;
const OPENAI_UNKNOWN = 'openai/unknown' as AgentModelId;
const SMART = 'smart' as AgentModelId;
const FAST = 'fast' as AgentModelId;
const LOCAL_THINKER = 'local/thinker' as AgentModelId;
const LOCAL_PLAIN = 'local/plain' as AgentModelId;
const LOCAL_WRITER = 'local/writer' as AgentModelId;
const LOCAL_EMBEDDING = 'local/embedding' as AgentModelId;
const MY_LOCAL_THINKER = 'my-local/thinker' as AgentModelId;
const MY_LOCAL_PLAIN = 'my-local/plain' as AgentModelId;
const MY_LOCAL_VIEWER = 'my-local/viewer' as AgentModelId;
const MY_LOCAL_BLANK = 'my-local/blank' as AgentModelId;
const BEDROCK_CLAUDE_3_HAIKU = 'bedrock/anthropic.claude-3-haiku-20240307-v1:0' as AgentModelId;

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
          name: 'Local Thinker',
          reasoningOptions: [{ type: 'effort', values: ['low', 'high'] }],
        },
        { id: 'plain', mode: 'chat' },
        {
          id: 'viewer',
          mode: 'chat',
          modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
        },
      ],
    },
  },
  routers: { smart: { model: 'openai/gpt-5' } },
} as unknown as SanitizedAIConfig;

function makeAgent({
  slug = 'support',
  model = OPENAI_TEST,
  access,
  options = [],
}: {
  slug?: string;
  model?: AgentModelId;
  access?: AgentInstance['config']['access'];
  options?: AgentInstance['config']['model']['options'];
} = {}): AgentInstance {
  return {
    slug,
    config: {
      slug,
      model: { default: model, options: [...new Set([model, ...options])] },
      instructions: 'Help',
      access,
      tools: [],
    },
    aiAgent: { tools: {} } as unknown as AgentInstance['aiAgent'],
    generate: vi.fn() as AgentInstance['generate'],
    stream: vi.fn() as AgentInstance['stream'],
    streamMessage: vi.fn() as AgentInstance['streamMessage'],
  };
}

function makeRequest({
  agents,
  ai = config,
  authorizations,
  user = { id: 'user-1' },
}: {
  agents: Record<string, AgentInstance>;
  ai?: SanitizedAIConfig;
  authorizations?: ReturnType<typeof vi.fn>;
  user?: { id: string; modelAccess?: 'all' | 'selected'; models?: string[] } | null;
}): FrogBotRequest {
  return {
    user,
    frogbot: {
      agents,
      config: { ai },
      connections: authorizations ? { authorizations } : undefined,
    },
  } as unknown as FrogBotRequest;
}

async function sanitizeAgent(
  model: AgentConfig['model'],
  routers: SanitizedAIConfig['routers'] = {},
) {
  const sanitized = sanitizeConfig({
    secret: 'test-secret',
    db: {} as FrogBotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [] }],
    ai: {
      providers: {
        local: {
          type: 'openai-compatible',
          baseUrl: 'http://localhost:11434/v1',
          models: [
            {
              id: 'thinker',
              mode: 'chat',
              reasoningOptions: [{ type: 'effort', values: ['low', 'high'] }],
            },
            { id: 'plain', mode: 'chat' },
            { id: 'writer', mode: 'chat' },
            { id: 'embedding', mode: 'embedding' },
          ],
        },
      },
      routers,
    },
    agents: [{ slug: 'support', instructions: 'Help', model }],
  });

  await sanitized._internal.payloadConfig;

  const agent = makeAgent();

  agent.config = sanitized.agents![0]!;

  return { agent, config: sanitized.ai! };
}

describe('agent service', () => {
  it.each([
    ['wildcard', { default: FAST, options: '*' }, [FAST, LOCAL_PLAIN, LOCAL_THINKER, LOCAL_WRITER]],
    [
      'array',
      { default: FAST, options: [LOCAL_THINKER, FAST, LOCAL_THINKER] },
      [FAST, LOCAL_THINKER],
    ],
  ] as const)(
    'preserves router and target manifest choices for sanitized %s options',
    async (_, model, expected) => {
      const { agent, config: ai } = await sanitizeAgent(model, {
        fast: { model: LOCAL_THINKER },
      });

      const req = makeRequest({ agents: { support: agent }, ai });

      const manifest = await getAgentManifest({ req });

      expect(manifest.agents[0].models).toEqual(expected);
      expect(manifest.agents[0].defaultModel).toBe(FAST);

      expected.forEach((id) => {
        expect(
          assertAgentSelection({ agent, config: ai, selection: { model: id }, user: req.user }),
        ).toEqual({ model: id === FAST ? 'local/thinker' : id });
      });
    },
  );

  it('advertises selectable reasoning variants for a sanitized router and its target', async () => {
    const { agent, config: ai } = await sanitizeAgent(
      { default: FAST, options: '*' },
      { fast: { model: LOCAL_THINKER } },
    );

    const req = makeRequest({ agents: { support: agent }, ai });

    const manifest = await getAgentManifest({ req });

    expect(manifest.agents[0].reasoning).toEqual({
      fast: [
        { key: 'low', label: 'Low' },
        { key: 'high', label: 'High' },
      ],
      'local/thinker': [
        { key: 'low', label: 'Low' },
        { key: 'high', label: 'High' },
      ],
    });

    [FAST, LOCAL_THINKER].forEach((model) => {
      manifest.agents[0].reasoning![model]!.forEach(({ key }) => {
        expect(
          assertAgentSelection({
            agent,
            config: ai,
            selection: { model, reasoning: key },
            user: req.user,
          }),
        ).toMatchObject({ model: LOCAL_THINKER, variant: { key } });
      });
    });
  });

  it('resolves a sanitized router default when no model is selected', async () => {
    const { agent, config: ai } = await sanitizeAgent(
      { default: FAST, options: [LOCAL_THINKER] },
      { fast: { model: LOCAL_THINKER } },
    );

    const selection = assertAgentSelection({ agent, config: ai, selection: {}, user: null });

    expect(selection).toEqual({ model: LOCAL_THINKER });
  });

  it('filters an expanded wildcard by the user selected model access', async () => {
    const { agent, config: ai } = await sanitizeAgent({ default: LOCAL_THINKER, options: '*' });
    const req = makeRequest({
      agents: { support: agent },
      ai,
      user: { id: 'user-1', modelAccess: 'selected', models: [LOCAL_WRITER, LOCAL_PLAIN] },
    });

    const manifest = await getAgentManifest({ req });
    const selection = assertAgentSelection({ agent, config: ai, selection: {}, user: req.user });

    expect(agent.config.model.options).toEqual([LOCAL_THINKER, LOCAL_PLAIN, LOCAL_WRITER]);
    expect(manifest.agents[0].models).toEqual([LOCAL_PLAIN, LOCAL_WRITER]);
    expect(manifest.agents[0].defaultModel).toBe(LOCAL_PLAIN);
    expect(selection).toEqual({ model: LOCAL_PLAIN });
    expect(() =>
      assertAgentSelection({
        agent,
        config: ai,
        selection: { model: LOCAL_THINKER },
        user: req.user,
      }),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });

  it.each([
    [
      'wildcard',
      { default: LOCAL_THINKER, options: '*' },
      [LOCAL_THINKER, LOCAL_PLAIN, LOCAL_WRITER],
    ],
    [
      'array',
      { default: LOCAL_THINKER, options: [LOCAL_PLAIN, LOCAL_THINKER, LOCAL_PLAIN] },
      [LOCAL_THINKER, LOCAL_PLAIN],
    ],
  ] as const)(
    'accepts exactly the manifest models for sanitized %s options',
    async (_, model, expected) => {
      const { agent, config: ai } = await sanitizeAgent(model);
      const req = makeRequest({ agents: { support: agent }, ai });
      const candidates: AgentModelId[] = [
        LOCAL_THINKER,
        LOCAL_PLAIN,
        LOCAL_WRITER,
        LOCAL_EMBEDDING,
        'openai/gpt-4o',
      ];

      const manifest = await getAgentManifest({ req });
      const offered = manifest.agents[0].models;
      const rejected = candidates.filter((candidate) => !offered.includes(candidate));

      expect(offered).toEqual(expected);
      expect(offered).toEqual(agent.config.model.options);

      offered.forEach((id) => {
        expect(
          assertAgentSelection({ agent, config: ai, selection: { model: id }, user: req.user }),
        ).toEqual({ model: id });
      });

      rejected.forEach((id) => {
        expect(() =>
          assertAgentSelection({ agent, config: ai, selection: { model: id }, user: req.user }),
        ).toThrow(expect.objectContaining({ status: 403 }));
      });
    },
  );

  it('offers only a sanitized string model and rejects another configured chat model', async () => {
    const { agent, config: ai } = await sanitizeAgent(LOCAL_THINKER);
    const req = makeRequest({ agents: { support: agent }, ai });

    const manifest = await getAgentManifest({ req });

    expect(manifest.agents[0].models).toEqual([LOCAL_THINKER]);
    expect(manifest.agents[0].defaultModel).toBe(LOCAL_THINKER);
    expect(assertAgentSelection({ agent, config: ai, selection: {}, user: req.user })).toEqual({
      model: LOCAL_THINKER,
    });
    expect(() =>
      assertAgentSelection({
        agent,
        config: ai,
        selection: { model: LOCAL_PLAIN },
        user: req.user,
      }),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });

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
        support: makeAgent({
          model: 'bedrock/us.amazon.nova-micro-v1:0',
          options: [OPENAI_OTHER, 'bedrock/us.amazon.nova-micro-v1:0'],
        }),
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
          defaultModel: 'bedrock/us.amazon.nova-micro-v1:0',
          models: ['bedrock/us.amazon.nova-micro-v1:0', OPENAI_OTHER],
          names: { 'bedrock/us.amazon.nova-micro-v1:0': 'Nova Micro (US)' },
          inputs: { 'bedrock/us.amazon.nova-micro-v1:0': ['text'] },
        },
      ],
    });
  });

  it('advertises the configured name of a custom model', async () => {
    const req = makeRequest({
      agents: { support: makeAgent({ model: MY_LOCAL_THINKER, options: [MY_LOCAL_PLAIN] }) },
    });

    const manifest = await getAgentManifest({ req });

    expect(manifest.agents[0].names).toEqual({ 'my-local/thinker': 'Local Thinker' });
  });

  it.each([BEDROCK_CLAUDE_3_HAIKU, MY_LOCAL_PLAIN, SMART])(
    'omits names when %s has no display name',
    async (model) => {
      const req = makeRequest({ agents: { support: makeAgent({ model }) } });

      const manifest = await getAgentManifest({ req });

      expect(manifest.agents[0]).not.toHaveProperty('names');
    },
  );

  it.each(['', '   '])('omits a blank configured custom model name %j', async (name) => {
    const ai = {
      ...config,
      providers: {
        'my-local': {
          type: 'openai-compatible',
          baseUrl: 'http://localhost:11434/v1',
          models: [{ id: 'blank', mode: 'chat', name }],
        },
      },
    } as unknown as SanitizedAIConfig;

    const req = makeRequest({ agents: { support: makeAgent({ model: MY_LOCAL_BLANK }) }, ai });

    const manifest = await getAgentManifest({ req });

    expect(manifest.agents[0]).not.toHaveProperty('names');
  });

  it('computes names only for models allowed for the user', async () => {
    const req = makeRequest({
      agents: {
        support: makeAgent({
          model: 'bedrock/us.amazon.nova-micro-v1:0',
          options: [MY_LOCAL_THINKER],
        }),
      },
      user: { id: 'user-1', modelAccess: 'selected', models: [MY_LOCAL_THINKER] },
    });

    const manifest = await getAgentManifest({ req });

    expect(manifest.agents[0].models).toEqual([MY_LOCAL_THINKER]);
    expect(manifest.agents[0].names).toEqual({ 'my-local/thinker': 'Local Thinker' });
  });

  it('filters manifest models in agent order rather than allowlist order', async () => {
    const req = makeRequest({
      agents: {
        support: makeAgent({ options: [OPENAI_OTHER, MY_LOCAL_PLAIN] }),
      },
      user: { id: 'user-1', modelAccess: 'selected', models: [MY_LOCAL_PLAIN, OPENAI_TEST] },
    });

    const manifest = await getAgentManifest({ req });

    expect(manifest.agents[0].models).toEqual([OPENAI_TEST, MY_LOCAL_PLAIN]);
    expect(manifest.agents[0].defaultModel).toBe(OPENAI_TEST);
  });

  it('falls back to the first allowed model when the default is blocked', async () => {
    const req = makeRequest({
      agents: {
        support: makeAgent({ options: [OPENAI_OTHER, MY_LOCAL_PLAIN] }),
      },
      user: { id: 'user-1', modelAccess: 'selected', models: [MY_LOCAL_PLAIN, OPENAI_OTHER] },
    });

    const manifest = await getAgentManifest({ req });

    expect(manifest.agents[0].defaultModel).toBe(OPENAI_OTHER);
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
      agents: { support: makeAgent({ options: [SMART, MY_LOCAL_THINKER] }) },
      user: { id: 'user-1', modelAccess: 'selected', models: [MY_LOCAL_THINKER] },
    });

    const manifest = await getAgentManifest({ req });

    expect(Object.keys(manifest.agents[0].reasoning ?? {})).toEqual([MY_LOCAL_THINKER]);
  });

  it.each([
    { id: 'user-1', modelAccess: 'all' as const, models: [OPENAI_OTHER] },
    { id: 'user-1' },
    null,
  ])('preserves the unrestricted manifest for user %o', async (user) => {
    const req = makeRequest({
      agents: { support: makeAgent({ options: [OPENAI_OTHER], access: () => true }) },
      user,
    });

    const manifest = await getAgentManifest({ req });

    expect(manifest.agents[0]).toEqual({
      slug: 'support',
      label: 'support',
      source: 'config',
      defaultModel: OPENAI_TEST,
      models: [OPENAI_TEST, OPENAI_OTHER],
    });
  });

  it('applies legacy model lists without a modelAccess field', async () => {
    const req = makeRequest({
      agents: { support: makeAgent({ options: [OPENAI_OTHER] }) },
      user: { id: 'user-1', models: [OPENAI_OTHER] },
    });

    const manifest = await getAgentManifest({ req });

    expect(manifest.agents[0].models).toEqual([OPENAI_OTHER]);
  });

  it('accepts an offered model allowed for the user', () => {
    const agent = makeAgent({ options: [OPENAI_OTHER] });
    const user = makeRequest({ agents: {}, user: { id: 'user-1', models: [OPENAI_OTHER] } }).user;

    expect(
      assertAgentSelection({ agent, config, selection: { model: OPENAI_OTHER }, user }),
    ).toEqual({ model: OPENAI_OTHER });
  });

  it('rejects an offered but user-blocked model before checking reasoning', () => {
    const agent = makeAgent({ options: [MY_LOCAL_THINKER] });
    const user = makeRequest({ agents: {}, user: { id: 'user-1', models: [OPENAI_TEST] } }).user;

    expect(() =>
      assertAgentSelection({
        agent,
        config,
        selection: { model: MY_LOCAL_THINKER, reasoning: 'invalid' },
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
      assertAgentSelection({ agent, config, selection: { model: MY_LOCAL_THINKER }, user }),
    ).toThrow(
      expect.objectContaining({
        message: "Model 'my-local/thinker' is not allowed for agent 'support'",
        status: 403,
      }),
    );
  });

  it('resolves the user fallback and its reasoning when no model is named', () => {
    const agent = makeAgent({ options: [MY_LOCAL_THINKER] });
    const user = makeRequest({
      agents: {},
      user: { id: 'user-1', models: [MY_LOCAL_THINKER] },
    }).user;

    expect(
      assertAgentSelection({ agent, config, selection: { reasoning: 'low' }, user }),
    ).toMatchObject({ model: MY_LOCAL_THINKER, variant: { key: 'low' } });
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
    [SMART, 'openai/gpt-5'],
    ['openai/gpt-5', SMART],
  ] as const)('does not unlock %s by allowlisting %s', (model, allowed) => {
    const agent = makeAgent({ options: [SMART, 'openai/gpt-5'] });
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
      actions: [
        { slug: 'read', description: 'read', input: z.object({}), run: () => Promise.resolve() },
        { slug: 'write', description: 'write', input: z.object({}), run: () => Promise.resolve() },
      ],
    })({ slug: 'work-sheets' });

    agent.config.tools = pieceInstanceTools(piece)!.map((tool) => ({ ...tool }));
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
        support: makeAgent({ options: [SMART, MY_LOCAL_THINKER, MY_LOCAL_PLAIN] }),
      },
    });

    const manifest = await getAgentManifest({ req });

    expect(Object.keys(manifest.agents[0].reasoning ?? {})).toEqual([SMART, MY_LOCAL_THINKER]);
    expect(manifest.agents[0].reasoning?.[MY_LOCAL_THINKER]).toEqual([
      { key: 'low', label: 'Low' },
      { key: 'high', label: 'High' },
    ]);
    expect(manifest.agents[0].reasoning?.[SMART]).toEqual(
      expect.arrayContaining([{ key: 'high', label: 'High' }]),
    );
  });

  it('advertises input types only for models whose types are known', async () => {
    const req = makeRequest({
      agents: {
        support: makeAgent({
          model: 'openai/gpt-5',
          options: [SMART, MY_LOCAL_VIEWER, MY_LOCAL_PLAIN, OPENAI_UNKNOWN],
        }),
      },
    });

    const manifest = await getAgentManifest({ req });

    expect(manifest.agents[0].inputs).toEqual({
      'openai/gpt-5': ['text', 'image'],
      smart: ['text', 'image'],
      'my-local/viewer': ['text', 'image', 'pdf'],
    });
  });

  it('omits inputs when no offered model has known types', async () => {
    const req = makeRequest({
      agents: { support: makeAgent({ model: MY_LOCAL_PLAIN, options: [OPENAI_UNKNOWN] }) },
    });

    const manifest = await getAgentManifest({ req });

    expect(manifest.agents[0]).not.toHaveProperty('inputs');
  });

  it('resolves the agent default model without reasoning when nothing is selected', () => {
    expect(assertAgentSelection({ agent: makeAgent(), config, selection: {}, user: null })).toEqual(
      {
        model: OPENAI_TEST,
      },
    );
  });

  it.each([OPENAI_TEST, OPENAI_OTHER] as const)('resolves the allowed model %s', (model) => {
    const agent = makeAgent({ options: [OPENAI_OTHER] });

    expect(assertAgentSelection({ agent, config, selection: { model }, user: null })).toEqual({
      model,
    });
  });

  it('resolves a router to its model and the model reasoning variant', () => {
    const agent = makeAgent({ options: [SMART, 'openai/gpt-5'] });

    const router = assertAgentSelection({
      agent,
      config,
      selection: { model: SMART, reasoning: 'high' },
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
    const agent = makeAgent({ options: [MY_LOCAL_THINKER] });

    expect(
      assertAgentSelection({
        agent,
        config,
        selection: { model: MY_LOCAL_THINKER, reasoning: 'low' },
        user: null,
      }),
    ).toEqual({
      model: MY_LOCAL_THINKER,
      variant: {
        key: 'low',
        label: 'Low',
        providerOptions: { myLocal: { reasoningEffort: 'low' } },
      },
    });
  });

  it('checks a reasoning option against the agent default model when no model is selected', () => {
    const agent = makeAgent({ model: MY_LOCAL_THINKER, options: ['openai/gpt-5'] });

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
    const agent = makeAgent({ options: [MY_LOCAL_PLAIN] });

    expect(() =>
      assertAgentSelection({
        agent,
        config,
        selection: { model: MY_LOCAL_PLAIN, reasoning: 'high' },
        user: null,
      }),
    ).toThrow(
      expect.objectContaining({
        message: "Reasoning option 'high' is not available for model 'my-local/plain'",
        status: 400,
      }),
    );
  });

  it('rejects a model outside the agent options with 403 before checking reasoning', () => {
    const agent = makeAgent({ options: [OPENAI_OTHER] });

    expect(() =>
      assertAgentSelection({
        agent,
        config,
        selection: { model: MY_LOCAL_THINKER, reasoning: 'high' },
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
      user: { id: 'user-1', modelAccess: 'selected', models: [OPENAI_OTHER] },
    });

    await expect(canUseAgent({ req, agent })).resolves.toEqual({
      allowed: false,
      denied: 'models',
    });
  });

  it('allows agent use when only a fallback model is usable', async () => {
    const agent = makeAgent({ options: [OPENAI_OTHER] });
    const req = makeRequest({
      agents: { support: agent },
      user: { id: 'user-1', modelAccess: 'selected', models: [OPENAI_OTHER] },
    });

    await expect(canUseAgent({ req, agent })).resolves.toEqual({ allowed: true });
  });
});
