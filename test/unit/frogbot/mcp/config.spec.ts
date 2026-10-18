import type * as PayloadModule from 'payload';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentConfig } from '../../../../packages/frogbot/src/agents/types.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import { mcpServer } from '../../../../packages/frogbot/src/mcp/server.js';
import type { MCPServerOptions } from '../../../../packages/frogbot/src/mcp/types.js';

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

const browser = mcpServer({ name: 'browser', type: 'local', command: ['npx', 'browser-mcp'] });
const docs = mcpServer({ name: 'docs', type: 'remote', url: 'https://docs.example.com/mcp' });

function makeConfig(overrides: Partial<FrogBotConfig>): FrogBotConfig {
  return {
    secret: 'test-secret',
    db: {} as FrogBotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [{ name: 'name', type: 'text' }] }],
    ai,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mcpServer config', () => {
  it('returns a frozen server', () => {
    expect(Object.isFrozen(browser)).toBe(true);
    expect(browser).toMatchObject({ name: 'browser', type: 'local' });
  });

  it('puts servers in a separate mcp list, root ones first', () => {
    const lookup = {
      slug: 'lookup',
      description: 'Look up',
      inputSchema: {},
      execute: vi.fn(),
    } as never;

    const result = sanitize(
      makeConfig({ tools: [browser], agents: [{ ...agent, tools: [lookup, docs] }] }),
    );

    expect(result.agents?.[0].mcp).toEqual([browser, docs]);
    expect(result.agents?.[0].tools?.map(({ slug }) => slug)).toEqual(['lookup']);
  });

  it('lets an agent opt out of root servers', () => {
    const result = sanitize(
      makeConfig({
        tools: [browser],
        agents: [
          { ...agent, inheritTools: false },
          { ...agent, slug: 'sales' },
        ],
      }),
    );

    expect(result.agents?.[0].mcp).toBeUndefined();
    expect(result.agents?.[1].mcp).toEqual([browser]);
  });

  it('lets an agent server replace a root server of the same name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const own = mcpServer({ name: 'browser', type: 'remote', url: 'http://localhost:9000/mcp' });

    const result = sanitize(makeConfig({ tools: [browser], agents: [{ ...agent, tools: [own] }] }));

    expect(result.agents?.[0].mcp).toEqual([own]);
    expect(warn).toHaveBeenCalledWith(
      "[frogbot] Agent 'support' MCP server 'browser' shadows root MCP server 'browser'.",
    );
  });

  it.each<[string, Partial<MCPServerOptions> | Record<string, unknown>, string]>([
    [
      'a name with a space',
      { name: 'my browser' },
      "[frogbot] MCP server name 'my browser' in agent 'support' may only use letters, digits, '_' and '-'.",
    ],
    [
      'a missing command',
      { command: [] },
      "[frogbot] MCP server 'browser' in agent 'support' requires a `command` array.",
    ],
    [
      'a missing url',
      { type: 'remote', url: undefined },
      "[frogbot] MCP server 'browser' in agent 'support' requires a `url`.",
    ],
    [
      'an unknown type',
      { type: 'sse' },
      "[frogbot] MCP server 'browser' in agent 'support' `type` must be 'local' or 'remote'.",
    ],
    [
      'a non-string environment value',
      { environment: { PORT: 9000 } },
      "[frogbot] MCP server 'browser' in agent 'support' `environment` must map names to strings; 'PORT' is number.",
    ],
    [
      'an environment variable that is not set',
      { environment: { SIDEKICK_TOKEN: undefined } },
      "[frogbot] MCP server 'browser' in agent 'support' `environment` must map names to strings; 'SIDEKICK_TOKEN' is undefined.",
    ],
    [
      'a negative timeout',
      { timeout: { startup: -1 } },
      "[frogbot] MCP server 'browser' in agent 'support' `timeout.startup` must be a positive number of ms.",
    ],
    [
      'an unknown timeout',
      { timeout: { connect: 10 } },
      "[frogbot] MCP server 'browser' in agent 'support' `timeout` takes only startup, catalog and execution.",
    ],
  ])('rejects %s', (_, overrides, message) => {
    const server = mcpServer({ ...browser, ...overrides } as MCPServerOptions);

    expect(() => sanitize(makeConfig({ agents: [{ ...agent, tools: [server] }] }))).toThrow(
      message,
    );
  });

  it('rejects two servers with one name in a list', () => {
    expect(() => sanitize(makeConfig({ tools: [browser, browser] }))).toThrow(
      "[frogbot] Duplicate MCP server 'browser' in root.",
    );
  });
});
