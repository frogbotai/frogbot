import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AIIndex from '../../../../packages/frogbot/src/ai/index.js';
import type { FrogBotSanitizedConfig } from '../../../../packages/frogbot/src/config/sanitized.js';
import { createCredentialEncryption } from '../../../../packages/frogbot/src/connections/encryption.js';
import { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';
import type { MCPServer } from '../../../../packages/frogbot/src/mcp/types.js';
import { isRunning, type Scratch, scratch } from './fixture.js';

const SECRET = 'test-secret-min-32-chars-long-for-jwt';

const mocked = vi.hoisted(() => {
  const create = () => ({
    config: { collections: [], serverURL: 'http://localhost:3000' },
    secret: 'test-secret-min-32-chars-long-for-jwt',
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    kv: {},
    destroy: vi.fn(),
  });

  return { create, payload: create() };
});

vi.mock('payload', () => ({
  APIError: class APIError extends Error {},
  getPayload: vi.fn(() => mocked.payload),
  createPayloadRequest: vi.fn(({ req }) => ({ ...req, payload: mocked.payload })),
  handleEndpoints: vi.fn(),
}));

vi.mock('../../../../packages/frogbot/src/ai/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof AIIndex>()),
  createAIGateway: () => ({
    chatModel: () =>
      new MockLanguageModelV4({
        doStream: () =>
          Promise.resolve({
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage: {
                    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                    outputTokens: { total: 0, text: 0, reasoning: 0 },
                  },
                });

                controller.close();
              },
            }),
          }),
      }),
    operation: () => ({ start: async () => {}, finish: async () => {} }),
  }),
}));

let fixture: Scratch;

beforeEach(async () => {
  mocked.payload = mocked.create();
  fixture = await scratch();
});

afterEach(async () => {
  await fixture.cleanup();
});

function makeConfig(mcp: MCPServer[], slugs = ['researcher', 'support']): FrogBotSanitizedConfig {
  return {
    collections: [],
    secret: SECRET,
    chat: { enabled: false },
    connections: {
      enabled: false,
      encryption: createCredentialEncryption({ secret: SECRET }),
      entries: {},
    },
    pieces: { instances: [] },
    roles: [],
    settings: [],
    ai: {
      providers: { openai: { apiKey: 'sk-test' } },
      routers: {},
      hooks: {
        beforeOperation: [],
        beforeUpstream: [],
        afterUpstream: [],
        afterError: [],
        afterOperation: [],
      },
      access: {
        generate: () => true,
        embed: () => true,
        transcribe: () => true,
        rerank: () => true,
        evaluate: () => true,
      },
      telemetry: { enabled: false },
      usage: { slug: 'usage-logs' },
      _internal: { deploymentId: 'test' },
    },
    agents: slugs.map((slug) => ({
      slug,
      instructions: 'Help',
      model: { default: 'openai/gpt-4o', options: ['openai/gpt-4o'] },
      mcp,
    })),
    _internal: {
      payloadConfig: Promise.resolve({} as never),
      noEmail: true,
      triggers: {},
      autonumbers: [],
    },
  } as unknown as FrogBotSanitizedConfig;
}

async function run(frogbot: FrogBot, slug: string) {
  await (await frogbot.agents[slug].stream({ prompt: 'Hello' })).consumeStream();
}

describe('MCP connections over the FrogBot lifecycle', () => {
  it('starts nothing at init, one process per agent on first run, and ends them on destroy', async () => {
    const frogbot = await new FrogBot().init({
      config: makeConfig([fixture.server()]),
      disableOnInit: true,
    });

    expect(fixture.starts()).toEqual([]);

    await run(frogbot, 'researcher');
    await run(frogbot, 'researcher');
    await run(frogbot, 'support');

    const pids = fixture.starts().map(({ pid }) => pid);

    expect(pids).toHaveLength(2);

    await frogbot.destroy();
    await vi.waitFor(() => expect(pids.some(isRunning)).toBe(false));
  });

  it('ends the old processes when the config refreshes', async () => {
    const server = fixture.server();
    const frogbot = await new FrogBot().init({ config: makeConfig([server]), disableOnInit: true });

    await run(frogbot, 'researcher');

    const [first] = fixture.starts();

    await new FrogBot().init({ config: makeConfig([server], ['researcher']), disableOnInit: true });
    await vi.waitFor(() => expect(isRunning(first.pid)).toBe(false));

    await run(frogbot, 'researcher');

    expect(fixture.starts()).toHaveLength(2);

    await frogbot.destroy();
  });
});
