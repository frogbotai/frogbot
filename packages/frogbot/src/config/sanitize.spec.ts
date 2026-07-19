import { describe, expect, it, vi } from 'vitest';

import type { FrogbotConfig } from '../types/config.js';
import type { CollectionConfig } from '../types/collection.js';
import { ROLE_MARKERS } from '../types/collection.js';
import { registerFrogbotInstance } from '../instanceRegistry.js';

vi.mock('payload', () => ({
  buildConfig: vi.fn((config: unknown) => Promise.resolve(config)),
  handleEndpoints: vi.fn(),
}));

vi.mock('../getFrogbot.js', () => ({
  getCachedFrogbot: vi.fn(() => null),
}));

const { sanitize } = await import('./sanitize.js');

function makeConfig(overrides?: Partial<FrogbotConfig>): FrogbotConfig {
  return {
    secret: 'test-secret',
    db: {} as FrogbotConfig['db'],
    collections: [{ slug: 'users', auth: true, fields: [{ name: 'name', type: 'text' }] }],
    ...overrides,
  };
}

describe('frogbot sanitize', () => {
  it('throws `[frogbot] `globals` is not a FrogBot concept` when `globals` is present', () => {
    const config = makeConfig() as unknown as Record<string, unknown>;
    config.globals = [{ slug: 'site', fields: [] }];
    expect(() => sanitize(config as unknown as FrogbotConfig)).toThrowError(
      '[frogbot] `globals` is not a FrogBot concept',
    );
  });

  it('returns a FrogbotSanitizedConfig with collections metadata', () => {
    const config = makeConfig({
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'projects', project: true, fields: [] },
      ],
    });
    const result = sanitize(config);
    expect(result.collections).toEqual([
      { slug: 'users', roleMarkers: [], auth: true },
      { slug: 'projects', roleMarkers: ['project'], auth: false },
    ]);
  });

  it('preserves the secret in the sanitized config', () => {
    const config = makeConfig();
    const result = sanitize(config);
    expect(result.secret).toBe('test-secret');
  });

  it('stores a payloadConfig promise in _internal', () => {
    const config = makeConfig();
    const result = sanitize(config);
    expect(result._internal.payloadConfig).toBeInstanceOf(Promise);
  });

  it('the payload config strips role markers from collections', async () => {
    const config = makeConfig({
      collections: [
        { slug: 'projects', project: true, fields: [] },
        { slug: 'files', file: true, fields: [] },
      ],
    });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    for (const col of (payloadConfig as any).collections) {
       
      for (const marker of ROLE_MARKERS) {
        expect((col as Record<string, unknown>)[marker]).toBeUndefined();
      }
    }
  });

  it('captures role markers into custom.frogbot.roleMarkers in the payload config', async () => {
    const config = makeConfig({
      collections: [
        { slug: 'projects', project: true, fields: [] },
        { slug: 'files', file: true, thread: true, fields: [] },
      ],
    });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    const projects = (payloadConfig as any).collections.find((c: any) => c.slug === 'projects'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const files = (payloadConfig as any).collections.find((c: any) => c.slug === 'files'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(projects.custom.frogbot.roleMarkers).toEqual(['project']);
    expect(files.custom.frogbot.roleMarkers).toEqual(['file', 'thread']);
  });

  it('captures auth boolean state into custom.frogbot.auth in the payload config', async () => {
    const config = makeConfig({
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'posts', fields: [] },
      ],
    });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    const users = (payloadConfig as any).collections.find((c: any) => c.slug === 'users'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const posts = (payloadConfig as any).collections.find((c: any) => c.slug === 'posts'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(users.custom.frogbot.auth).toBe(true);
    expect(posts.custom.frogbot.auth).toBe(false);
  });

  it('preserves pre-existing custom fields on collections in the payload config', async () => {
    const config = makeConfig({
      collections: [
        {
          slug: 'projects',
          project: true,
          custom: { myKey: 'hello' },
          fields: [],
        },
      ],
    });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    const projects = (payloadConfig as any).collections.find((c: any) => c.slug === 'projects'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(projects.custom.myKey).toBe('hello');
    expect(projects.custom.frogbot).toBeDefined();
  });

  it('prepends the bootstrap beforeOperation hook in the payload config', async () => {
    const existingHook = () => {};
    const config = makeConfig({
      collections: [
        {
          slug: 'users',
          auth: true,
          fields: [],
          hooks: { beforeOperation: [existingHook] },
        } as unknown as CollectionConfig,
      ],
    });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    const users = (payloadConfig as any).collections.find((c: any) => c.slug === 'users'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const hooks = users.hooks?.beforeOperation ?? [];
    expect(hooks.length).toBe(2);
    expect(hooks[1]).toBe(existingHook);
  });

  it('wraps per-collection custom endpoint handlers in the payload config', async () => {
    const handler = () => new Response('ok');
    const config = makeConfig({
      collections: [
        {
          slug: 'users',
          auth: true,
          fields: [],
          endpoints: [{ path: '/test', method: 'get', handler }],
        },
      ],
    });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    const users = (payloadConfig as any).collections.find((c: any) => c.slug === 'users'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const endpoints = users.endpoints as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].handler).not.toBe(handler);
  });

  it('wraps root-level custom endpoint handlers in the payload config', async () => {
    const handler = () => new Response('ok');
    const config = makeConfig({
      endpoints: [{ path: '/health', method: 'get', handler }],
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    const endpoints = (payloadConfig as any).endpoints as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].handler).not.toBe(handler);
  });

  it('binds endpoint requests to the Frogbot instance for their Payload instance', async () => {
    const handler = vi.fn(() => new Response('ok'));
    const result = sanitize(
      makeConfig({
        endpoints: [{ path: '/health', method: 'get', handler }],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const endpoint = (payloadConfig as any).endpoints[0]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const payload = {};
    const frogbot = { agents: {} };
    registerFrogbotInstance(payload, frogbot as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    await endpoint.handler({ payload });

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ frogbot }));
  });

  it('drops the FrogBot plugins key from the payload config', async () => {
    const plugin = (c: FrogbotConfig) => c;
    const config = makeConfig({ plugins: [plugin] });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    expect((payloadConfig as any).plugins).toBeUndefined(); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it('does not mutate the caller\u2019s input config or collection objects', () => {
    const collections: CollectionConfig[] = [
      {
        slug: 'projects',
        project: true,
        fields: [{ name: 'title', type: 'text' }],
      },
    ];
    const config = makeConfig({ collections });
    const originalStr = JSON.stringify(config);
    sanitize(config);
    expect(JSON.stringify(config)).toBe(originalStr);
  });

  it('injects bootstrap hook on collections with no existing hooks in the payload config', async () => {
    const config = makeConfig({
      collections: [{ slug: 'bare', fields: [] }],
    });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    const bare = (payloadConfig as any).collections.find((c: any) => c.slug === 'bare'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(bare.hooks?.beforeOperation).toHaveLength(1);
  });

  it('handles `endpoints: false` without crashing', () => {
    const config = makeConfig({
      collections: [
        {
          slug: 'users',
          auth: true,
          fields: [],
          endpoints: false,
        } as unknown as CollectionConfig,
      ],
    });
    expect(() => sanitize(config)).not.toThrow();
  });

  it('returns collections metadata in the same order as input', () => {
    const config = makeConfig({
      collections: [
        { slug: 'alpha', fields: [] },
        { slug: 'beta', fields: [] },
        { slug: 'gamma', fields: [] },
      ],
    });
    const result = sanitize(config);
    const slugs = result.collections.map((c) => c.slug);
    expect(slugs).toEqual(['alpha', 'beta', 'gamma']);
  });

  describe('ai.providers', () => {
    it('throws when ai is configured with no providers', () => {
      const config = makeConfig({ ai: { providers: {} } });
      expect(() => sanitize(config)).toThrow(
        '[frogbot] At least one AI provider must be configured under `ai.providers`.',
      );
    });

    it('throws when every provider entry is undefined', () => {
      const config = makeConfig({ ai: { providers: { openai: undefined } } });
      expect(() => sanitize(config)).toThrow(
        '[frogbot] At least one AI provider must be configured under `ai.providers`.',
      );
    });

    it('throws when a custom provider has an empty models array', () => {
      const config = makeConfig({
        ai: {
          providers: {
            internal: {
              type: 'openai-compatible',
              baseUrl: 'https://models.test',
              models: [],
            },
          },
        },
      });
      expect(() => sanitize(config)).toThrow("[frogbot] Custom provider 'internal' requires a non-empty models array.");
    });
  });

  describe('agents', () => {
    const ai = { providers: { openai: { apiKey: 'sk-test' } } };
    const agent = {
      slug: 'support',
      model: 'openai/test',
      instructions: 'Help the user',
    };

    it('sanitizes agents, defaults access, registers endpoints, and removes agents from Payload', async () => {
      const result = sanitize(makeConfig({ ai, agents: [agent] }));
      const payloadConfig = await result._internal.payloadConfig;

      expect(result.agents).toHaveLength(1);
      expect(result.agents?.[0].access).toBeTypeOf('function');
      expect((payloadConfig as any).agents).toBeUndefined(); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect((payloadConfig as any).endpoints.map((endpoint: any) => endpoint.path)) // eslint-disable-line @typescript-eslint/no-explicit-any
        .toEqual(['/agents/:slug', '/agents']);
    });

    it('rejects an empty agents array', () => {
      expect(() => sanitize(makeConfig({ ai, agents: [] }))).toThrow(
        '[frogbot] `agents` must be a non-empty array when configured.',
      );
    });

    it('rejects an empty tools array', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [{ ...agent, tools: [] }],
          }),
        ),
      ).toThrow("[frogbot] Agent 'support' tools must be a non-empty array when configured.");
    });

    it('rejects an empty stopWhen array', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [{ ...agent, stopWhen: [] }],
          }),
        ),
      ).toThrow("[frogbot] Agent 'support' stopWhen must contain at least one condition.");
    });

    it('does not resolve models through disabled provider entries', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai: {
              providers: {
                anthropic: { apiKey: 'test' },
                openai: undefined,
              },
            },
            agents: [agent],
          }),
        ),
      ).toThrow("[frogbot] Agent 'support' model 'openai/test' does not resolve to a configured provider.");
    });

    it('reserves the agent collection slug even when no agents are configured', () => {
      expect(() =>
        sanitize(
          makeConfig({
            collections: [{ slug: 'agents', fields: [] }],
          }),
        ),
      ).toThrow("[frogbot] Collection slug 'agents' is reserved for the agent API.");
    });

    it('reserves agent endpoint paths even when no agents are configured', () => {
      expect(() =>
        sanitize(
          makeConfig({
            endpoints: [
              {
                path: '/agents/custom',
                method: 'post',
                handler: () => new Response(),
              },
            ],
          }),
        ),
      ).toThrow("[frogbot] Endpoint path '/agents/custom' is reserved for the agent API.");
    });

    it('rejects non-URL-safe agent slugs', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [{ ...agent, slug: 'support/admin' }],
          }),
        ),
      ).toThrow("[frogbot] Agent slug 'support/admin' is not URL-safe.");
    });
  });

  describe('ai.telemetry', () => {
    function aiConfig(overrides?: Partial<FrogbotConfig['ai']>) {
      return makeConfig({
        ai: {
          providers: { openai: { apiKey: 'sk-test' } },
          deploymentId: 'unit-test-deployment',
          ...overrides,
        },
      });
    }

    it('defaults telemetry.enabled to true when not configured', () => {
      const result = sanitize(aiConfig());
      expect(result.ai?.telemetry.enabled).toBe(true);
      expect(result.ai?.telemetry.enrichSpan).toBeUndefined();
    });

    it('respects telemetry.enabled: false', () => {
      const result = sanitize(aiConfig({ telemetry: { enabled: false } }));
      expect(result.ai?.telemetry.enabled).toBe(false);
    });

    it('preserves a user-provided enrichSpan callback', () => {
      const enrichSpan = vi.fn(() => ({ 'app.tenant': 'acme' }));
      const result = sanitize(aiConfig({ telemetry: { enrichSpan } }));
      expect(result.ai?.telemetry.enrichSpan).toBe(enrichSpan);
      expect(result.ai?.telemetry.enabled).toBe(true);
    });
  });
});
