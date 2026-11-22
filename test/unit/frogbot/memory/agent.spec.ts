import type * as PayloadModule from 'payload';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { AgentConfig } from '../../../../packages/frogbot/src/agents/types.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { databaseMemory } from '../../../../packages/frogbot/src/memory/database/adapter.js';
import { memoryTools } from '../../../../packages/frogbot/src/memory/tools.js';
import { resolveToolApproval } from '../../../../packages/frogbot/src/tools/approval.js';
import type { Tool } from '../../../../packages/frogbot/src/tools/types.js';
import type { FrogBotRequest } from '../../../../packages/frogbot/src/types/request.js';

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadModule>()),
  buildConfig: vi.fn((config: Record<string, unknown>) =>
    Promise.resolve({ globals: [], ...config }),
  ),
}));

const { sanitize } = await import('../../../../packages/frogbot/src/config/sanitize.js');

const ai = { providers: { openai: { apiKey: 'sk-test' } } };

const agent = {
  slug: 'support',
  model: 'openai/gpt-5.4-mini',
  instructions: 'Help the user',
} satisfies AgentConfig;

const memorySlugs = ['memory_search', 'memory_save', 'memory_forget'];

function makeConfig(overrides?: Partial<FrogBotConfig>): FrogBotConfig {
  return {
    secret: 'test-secret',
    db: { name: 'sqlite' } as FrogBotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [] }],
    ai,
    ...overrides,
  };
}

function makeTool(slug: string): Tool {
  return { slug, description: `Run ${slug}`, inputSchema: z.object({}), execute: () => 'ok' };
}

function toolSlugs(config: FrogBotConfig, slug = 'support'): string[] {
  return (sanitize(config).agents?.find((entry) => entry.slug === slug)?.tools ?? []).map(
    (tool) => tool.slug,
  );
}

async function approvalOf(slug: string, memory?: FrogBotConfig['memory']) {
  const tool = memoryTools.find((entry) => entry.slug === slug)!;
  const req = { frogbot: { config: { memory } } } as unknown as FrogBotRequest;

  return resolveToolApproval({
    approval: 'approval' in tool ? tool.approval : undefined,
    input: {},
    req,
    agent: { slug: 'support', runId: 'run-1' },
    tool: { slug },
    logger: { error: vi.fn() },
  });
}

describe('agent memory config', () => {
  it('throws when an agent opts in without the root adapter, and names the fix', () => {
    expect(() => sanitize(makeConfig({ agents: [{ ...agent, memory: true }] }))).toThrow(
      "[frogbot] Agent 'support' sets `memory: true`, but memory is not configured. Set `memory: databaseMemory()` in your FrogBot config.",
    );
  });

  it.each(memorySlugs)('reserves the %s tool slug', (slug) => {
    expect(() =>
      sanitize(
        makeConfig({
          memory: databaseMemory(),
          agents: [{ ...agent, memory: true, tools: [makeTool(slug)] }],
        }),
      ),
    ).toThrow(`[frogbot] Tool slug '${slug}' is reserved for agent memory.`);
  });

  it('reserves the memory tool slugs after root tool inheritance', () => {
    expect(() =>
      sanitize(
        makeConfig({
          memory: databaseMemory(),
          tools: [makeTool('memory_save')],
          agents: [{ ...agent, memory: true }],
        }),
      ),
    ).toThrow("[frogbot] Tool slug 'memory_save' is reserved for agent memory.");
  });

  it('adds the memory tools only to agents that opt in', () => {
    const config = makeConfig({
      memory: databaseMemory(),
      agents: [
        { ...agent, memory: true, tools: [makeTool('lookup')] },
        { ...agent, slug: 'plain' },
        { ...agent, slug: 'off', memory: false },
      ],
    });

    expect(toolSlugs(config)).toEqual(['lookup', ...memorySlugs]);
    expect(toolSlugs(config, 'plain')).toEqual([]);
    expect(toolSlugs(config, 'off')).toEqual([]);
  });

  it('rejects a memory option that is not a boolean', () => {
    expect(() =>
      sanitize(
        makeConfig({
          memory: databaseMemory(),
          agents: [{ ...agent, memory: 'yes' as unknown as boolean }],
        }),
      ),
    ).toThrow("[frogbot] Agent 'support' memory must be true or false.");
  });

  it('rejects an unknown tool and a bad approval in `tools`', () => {
    const unknown = { ...databaseMemory(), tools: { memory_list: {} } } as never;
    const bad = databaseMemory({ tools: { memory_save: { approval: 'sometimes' as never } } });

    expect(() => sanitize(makeConfig({ memory: unknown }))).toThrow(
      "`tools` has unknown tool 'memory_list'",
    );
    expect(() => sanitize(makeConfig({ memory: bad }))).toThrow(
      "memory tool 'memory_save' `approval` must be false, 'ask', 'required' or a function.",
    );
  });
});

describe('memory tool approval', () => {
  it('runs save and search, and asks before forget, by default', async () => {
    const memory = databaseMemory();

    await expect(approvalOf('memory_save', memory)).resolves.toEqual({ mode: false });
    await expect(approvalOf('memory_search', memory)).resolves.toEqual({ mode: false });
    await expect(approvalOf('memory_forget', memory)).resolves.toEqual({ mode: 'ask' });
  });

  it('takes the app-wide override, including a rule that checks the agent', async () => {
    const memory = databaseMemory({
      tools: {
        memory_save: { approval: 'required' },
        memory_forget: { approval: ({ agent }) => (agent.slug === 'support' ? false : 'ask') },
      },
    });

    await expect(approvalOf('memory_save', memory)).resolves.toEqual({ mode: 'required' });
    await expect(approvalOf('memory_forget', memory)).resolves.toEqual({ mode: false });
  });
});
