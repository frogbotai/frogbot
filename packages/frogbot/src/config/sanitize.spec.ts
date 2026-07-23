import { describe, expect, it, vi } from 'vitest';

import type { FrogbotConfig } from '../types/config.js';
import type { CollectionConfig } from '../types/collection.js';
import type { Frogbot } from '../frogbot.js';
import { getFrogbotInstance, registerFrogbotInstance } from '../instanceRegistry.js';
import { getCachedFrogbot, resetFrogbotCache } from '../getFrogbot.js';

vi.mock('payload', () => ({
  buildConfig: vi.fn((config: unknown) => Promise.resolve(config)),
  handleEndpoints: vi.fn(),
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

function makePayload(config: unknown) {
  return {
    config,
    secret: 'test-secret',
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    },
    db: {},
    kv: {},
    email: {},
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
        { slug: 'projects', fields: [] },
      ],
    });
    const result = sanitize(config);
    expect(result.collections).toEqual([
      { slug: 'users', auth: true },
      { slug: 'projects', auth: false },
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
    const endpoint = (payloadConfig as unknown as { endpoints: { handler: (req: unknown) => Promise<Response> }[] })
      .endpoints[0];
    const payload = {};
    const frogbot = { agents: {} };
    registerFrogbotInstance(payload, frogbot as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    await endpoint.handler({ payload });

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ frogbot }));
    expect(payload).not.toHaveProperty('frogbot');
  });

  it('registers and caches Frogbot during Payload initialization', async () => {
    resetFrogbotCache();
    const onInit = vi.fn();
    const result = sanitize(makeConfig({ onInit }));
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);

    await payloadConfig.onInit?.(payload as never);

    const frogbot = getFrogbotInstance(payload);
    expect(frogbot).toBeDefined();
    expect(getCachedFrogbot()).toBe(frogbot);
    expect(onInit).toHaveBeenCalledOnce();
  });

  it('initializes a Payload instance idempotently', async () => {
    resetFrogbotCache();
    const onInit = vi.fn();
    const result = sanitize(makeConfig({ onInit }));
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);

    await payloadConfig.onInit?.(payload as never);
    const first = getFrogbotInstance(payload);
    await payloadConfig.onInit?.(payload as never);

    expect(first).toBeDefined();
    expect(getFrogbotInstance(payload)).toBe(first);
    expect(onInit).toHaveBeenCalledOnce();
  });

  it('rejects endpoint requests when lifecycle registration is missing', async () => {
    const handler = vi.fn(() => new Response('ok'));
    const result = sanitize(makeConfig({ endpoints: [{ path: '/health', method: 'get', handler }] }));
    const payloadConfig = await result._internal.payloadConfig;
    const endpoint = (payloadConfig as any).endpoints[0]; // eslint-disable-line @typescript-eslint/no-explicit-any

    expect(() => endpoint.handler({ payload: {} })).toThrow('[frogbot]');
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects operations when lifecycle registration is missing', async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;
    const collection = payloadConfig.collections[0];
    const bootstrap = collection.hooks.beforeOperation[0];

    expect(() => bootstrap({ req: { payload: {} } })).toThrow('[frogbot]');
  });

  it('binds root afterError requests without nesting Frogbot on Payload', async () => {
    const hookResult = { status: 418 };
    const afterError = vi.fn(() => hookResult);
    const result = sanitize(makeConfig({ hooks: { afterError: [afterError] } }));
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);
    const frogbot = { agents: {} };
    registerFrogbotInstance(payload, frogbot as unknown as Frogbot);
    const req = { payload };

    const args = { req, context: {}, error: new Error('test'), result: { errors: [] } };
    const hookResponse = await payloadConfig.hooks.afterError[0](args);

    expect(afterError).toHaveBeenCalledWith({ ...args, req: expect.objectContaining({ frogbot }) });
    expect(hookResponse).toBe(hookResult);
    expect(payload).not.toHaveProperty('frogbot');
  });

  it('drops the FrogBot plugins key from the payload config', async () => {
    const plugin = (c: FrogbotConfig) => c;
    const config = makeConfig({ plugins: [plugin] });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    expect((payloadConfig as any).plugins).toBeUndefined(); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it('rewrites @payloadcms component paths in the sanitized payload config', async () => {
    const config = makeConfig({
      admin: {
        dashboard: {
          widgets: [{ slug: 'collections', Component: '@payloadcms/next/rsc#CollectionCards', minWidth: 'full' }],
        },
      },
    } as unknown as Partial<FrogbotConfig>);
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    expect((payloadConfig as any).admin.dashboard.widgets[0].Component) // eslint-disable-line @typescript-eslint/no-explicit-any
      .toBe('@frogbotai/next/rsc#CollectionCards');
  });

  it('forces admin.importMap.autoGenerate false while preserving other admin keys', async () => {
    const config = makeConfig({
      admin: { theme: 'dark', importMap: { baseDir: '/tmp/base' } },
    } as unknown as Partial<FrogbotConfig>);
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    expect((payloadConfig as any).admin.importMap).toEqual({ baseDir: '/tmp/base', autoGenerate: false }); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect((payloadConfig as any).admin.theme).toBe('dark'); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it('injects FrogBot branding defaults into the payload config', async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = (await result._internal.payloadConfig) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(payloadConfig.admin.components.graphics).toEqual({
      Icon: '@frogbotai/next/rsc#FrogbotIcon',
      Logo: '@frogbotai/next/rsc#FrogbotLogo',
    });
    expect(payloadConfig.admin.meta.titleSuffix).toBe('- FrogBot');
    expect(payloadConfig.admin.meta.defaultOGImageType).toBe('static');
    expect(payloadConfig.admin.meta.openGraph.siteName).toBe('FrogBot');
    expect(payloadConfig.i18n.translations.en.general.payloadSettings).toBe('FrogBot Settings');
  });

  it('lets user branding config win over FrogBot defaults', async () => {
    const config = makeConfig({
      admin: {
        components: { graphics: { Logo: '/components/Logo#MyLogo' } },
        meta: {
          titleSuffix: '- Acme',
          defaultOGImageType: 'dynamic',
          openGraph: { siteName: 'Acme', images: [{ url: '/og.png' }] },
        },
      },
      i18n: { translations: { en: { general: { payloadSettings: 'Acme Settings' } } } },
    } as unknown as Partial<FrogbotConfig>);
    const result = sanitize(config);
    const payloadConfig = (await result._internal.payloadConfig) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(payloadConfig.admin.components.graphics).toEqual({
      Icon: '@frogbotai/next/rsc#FrogbotIcon',
      Logo: '/components/Logo#MyLogo',
    });
    expect(payloadConfig.admin.meta.titleSuffix).toBe('- Acme');
    expect(payloadConfig.admin.meta.defaultOGImageType).toBe('dynamic');
    expect(payloadConfig.admin.meta.openGraph).toEqual({
      description: expect.stringContaining('FrogBot'),
      siteName: 'Acme',
      images: [{ url: '/og.png' }],
    });
    expect(payloadConfig.i18n.translations.en.general.payloadSettings).toBe('Acme Settings');
  });

  it('preserves unrelated user i18n translations when injecting branding', async () => {
    const config = makeConfig({
      i18n: {
        fallbackLanguage: 'en',
        translations: { en: { general: { dashboard: 'Home' } }, es: { general: { dashboard: 'Inicio' } } },
      },
    } as unknown as Partial<FrogbotConfig>);
    const result = sanitize(config);
    const payloadConfig = (await result._internal.payloadConfig) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(payloadConfig.i18n.fallbackLanguage).toBe('en');
    expect(payloadConfig.i18n.translations.en.general).toEqual({
      dashboard: 'Home',
      payloadSettings: 'FrogBot Settings',
    });
    expect(payloadConfig.i18n.translations.es).toEqual({ general: { dashboard: 'Inicio' } });
  });

  it('does not mutate the caller\u2019s input config or collection objects', () => {
    const collections: CollectionConfig[] = [
      {
        slug: 'projects',
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

    it('accepts an undefined apiKey for SDK environment fallback', () => {
      const config = makeConfig({
        ai: { providers: { openai: { apiKey: undefined } } },
      });
      const result = sanitize(config);
      expect(result.ai?.providers.openai?.apiKey).toBeUndefined();
    });

    it('accepts an omitted apiKey for SDK environment fallback', () => {
      const result = sanitize(makeConfig({ ai: { providers: { openai: {} } } }));
      expect(result.ai?.providers.openai).toEqual({});
    });

    it('leaves empty apiKey validation to the gateway boundary', () => {
      const config = makeConfig({ ai: { providers: { openai: { apiKey: '' } } } });
      expect(() => sanitize(config)).not.toThrow();
    });

    it('leaves whitespace apiKey validation to the gateway boundary', () => {
      const config = makeConfig({ ai: { providers: { anthropic: { apiKey: '   ' } } } });
      expect(() => sanitize(config)).not.toThrow();
    });

    it('accepts Bedrock ambient credentials without static keys', () => {
      const config = makeConfig({ ai: { providers: { bedrock: {} } } });
      expect(() => sanitize(config)).not.toThrow();
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

    it('normalizes an empty agents array without AI to the omitted state', () => {
      const omitted = sanitize(makeConfig());
      const empty = sanitize(makeConfig({ agents: [] }));

      expect(empty.agents).toBeUndefined();
      expect(empty.chat).toEqual(omitted.chat);
    });

    it('normalizes an empty agents array with AI without enabling chat or agent endpoints', async () => {
      const result = sanitize(makeConfig({ ai, agents: [] }));
      const payloadConfig = await result._internal.payloadConfig;

      expect(result.agents).toBeUndefined();
      expect(result.chat.enabled).toBe(false);
      expect((payloadConfig as { endpoints?: unknown }).endpoints).toBeUndefined();
    });

    it.each([
      { endpoints: false as const, expected: false },
      {
        endpoints: [{ path: '/health', method: 'get' as const, handler: vi.fn() }],
        expected: ['/health'],
      },
    ])('preserves user endpoint configuration for empty agents', async ({ endpoints, expected }) => {
      const result = sanitize(makeConfig({ agents: [], endpoints }));
      const payloadConfig = await result._internal.payloadConfig;
      const payloadEndpoints = (payloadConfig as { endpoints?: false | { path: string }[] }).endpoints;

      expect(Array.isArray(payloadEndpoints) ? payloadEndpoints.map(({ path }) => path) : payloadEndpoints).toEqual(
        expected,
      );
    });

    it('rejects non-array agents before requiring AI', () => {
      expect(() => sanitize(makeConfig({ agents: null as never }))).toThrow(
        '[frogbot] `agents` must be an array.',
      );
    });

    it('requires AI for a non-empty agents array', () => {
      expect(() => sanitize(makeConfig({ agents: [agent] }))).toThrow(
        '[frogbot] `agents` requires an `ai` configuration block.',
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

  describe('chat', () => {
    const ai = { providers: { openai: { apiKey: 'sk-test' } } };
    const agents = [{ slug: 'support', model: 'openai/test', instructions: 'Help the user' }];

    it('is disabled when neither markers nor agents are configured', () => {
      const result = sanitize(makeConfig());
      expect(result.chat).toEqual({ enabled: false });
    });

    it('is enabled with default slugs when agents are configured', () => {
      const result = sanitize(makeConfig({ ai, agents }));
      expect(result.chat).toEqual({ enabled: true, threadsSlug: 'threads', messagesSlug: 'messages' });
    });

    it('resolves slugs from thread/message markers', () => {
      const result = sanitize(
        makeConfig({
          collections: [
            { slug: 'users', auth: true, fields: [] },
            { slug: 'conversations', thread: true, fields: [] },
            { slug: 'turns', message: true, fields: [] },
          ],
        }),
      );
      expect(result.chat).toEqual({ enabled: true, threadsSlug: 'conversations', messagesSlug: 'turns' });
    });

    it('strips markers from adopted collections in the payload config', async () => {
      const result = sanitize(
        makeConfig({
          collections: [
            { slug: 'users', auth: true, fields: [] },
            { slug: 'conversations', thread: true, fields: [] },
          ],
        }),
      );
      const payloadConfig = await result._internal.payloadConfig;
      const conversations = (payloadConfig as any).collections.find((c: any) => c.slug === 'conversations'); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(conversations.thread).toBeUndefined();
    });

    it('injects chat collections into the payload config and collections metadata', async () => {
      const result = sanitize(makeConfig({ ai, agents }));
      expect(result.collections.map((c) => c.slug)).toEqual(['users', 'threads', 'messages']);
      const payloadConfig = await result._internal.payloadConfig;
      const payloadSlugs = (payloadConfig as any).collections.map((c: any) => c.slug); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(payloadSlugs).toEqual(['users', 'threads', 'messages']);
    });

    it('injected chat collections get the bootstrap beforeOperation hook', async () => {
      const result = sanitize(makeConfig({ ai, agents }));
      const payloadConfig = await result._internal.payloadConfig;
      const threads = (payloadConfig as any).collections.find((c: any) => c.slug === 'threads'); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(threads.hooks?.beforeOperation?.length).toBeGreaterThan(0);
    });

    it('throws when an unmarked collection occupies a default chat slug', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents,
            collections: [
              { slug: 'users', auth: true, fields: [] },
              { slug: 'threads', fields: [] },
            ],
          }),
        ),
      ).toThrow("[frogbot] Collection slug 'threads' conflicts with the default chat thread collection.");
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
