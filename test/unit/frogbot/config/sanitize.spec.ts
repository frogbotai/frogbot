import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { general } from '../../../../packages/frogbot/src/agents/presets/general.js';
import type { CollectionConfig } from '../../../../packages/frogbot/src/collections/config/types.js';
import { compileCollectionViews } from '../../../../packages/frogbot/src/config/collectionViews.js';
import type { FrogbotConfig } from '../../../../packages/frogbot/src/config/types.js';
import type { Frogbot } from '../../../../packages/frogbot/src/frogbot.js';
import {
  getCachedFrogbot,
  resetFrogbotCache,
} from '../../../../packages/frogbot/src/getFrogbot.js';
import {
  getFrogbotInstance,
  registerFrogbotInstance,
} from '../../../../packages/frogbot/src/instanceRegistry.js';

vi.mock('payload', () => ({
  buildConfig: vi.fn((config: unknown) => Promise.resolve(config)),
  handleEndpoints: vi.fn(),
}));

const { sanitize } = await import('../../../../packages/frogbot/src/config/sanitize.js');

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

function emailWarnings(warn: ReturnType<typeof vi.fn>) {
  return warn.mock.calls.filter(([message]) =>
    String(message).includes('No email adapter provided'),
  );
}

describe('frogbot sanitize', () => {
  it('makes board collections orderable with per-view fields and a hook', async () => {
    const result = sanitize(
      makeConfig({
        collections: [
          {
            slug: 'posts',
            fields: [{ name: 'stage', type: 'select', options: [] }],
            admin: {
              views: [
                { type: 'list', defaultSort: '-createdAt' },
                { type: 'board', slug: 'By Stage', groupBy: 'stage' },
              ],
            },
          },
        ],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const posts = payloadConfig.collections?.find(({ slug }) => slug === 'posts');

    expect(posts?.orderable).toBe(true);
    expect(posts?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '_order_by_stage', type: 'text', index: true }),
      ]),
    );
    expect(posts?.hooks?.beforeChange).toHaveLength(1);
    expect(posts?.admin.defaultSort).toBe('-createdAt');
    expect((posts?.admin.custom?.frogbot as any).views[1].orderField).toBe('_order_by_stage');
  });

  it('leaves collections without boards non-orderable', async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;
    const users = payloadConfig.collections?.find(({ slug }) => slug === 'users');

    expect(users?.orderable).toBeUndefined();
    expect(users?.fields.some((field) => 'name' in field && field.name.startsWith('_order'))).toBe(
      false,
    );
    expect(users?.hooks?.beforeChange).toBeUndefined();
  });
  it('compiles collection views into runtime routes and metadata', () => {
    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [],
        admin: {
          views: [
            { type: 'list' },
            { type: 'custom', slug: 'stub', label: 'Stub', component: './Stub#StubView' },
          ],
        },
      },
    }) as never as Record<string, any>;

    expect(admin.components.views.stub).toMatchObject({
      Component: '@frogbotai/next/views#CustomCollectionView',
      exact: true,
      path: '/stub',
    });
    expect(admin.custom.frogbot.views).toEqual([
      { type: 'list', slug: 'list', label: 'List', path: '' },
      { type: 'custom', slug: 'stub', label: 'Stub', path: '/stub' },
    ]);
  });

  it('maps list slots and authoring edit views', () => {
    const beforeTable = './Before#Existing';
    const root = { Component: './Edit#Root' };
    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [],
        admin: {
          components: { edit: { views: { root } } },
          views: [{ type: 'list', components: { beforeTable } as never }],
        },
      },
    });

    expect(admin?.components?.beforeListTable).toBe(beforeTable);
    expect(admin?.components?.views?.edit?.root).toBe(root);
  });

  it('preserves valid nested settings entries in order', async () => {
    const settings = [
      { label: 'Usage', path: 'usage', Component: './settings/Usage#Page' },
      { label: 'Invoices', path: 'billing/invoices', Component: './settings/Invoices#Page' },
    ];
    const result = sanitize(makeConfig({ settings }));
    const payloadConfig = await result._internal.payloadConfig;

    expect(result.settings).toEqual(settings);
    expect((payloadConfig.admin as never as { settings: unknown[] }).settings).toEqual(settings);
  });

  it('preserves a custom settings root view', async () => {
    const result = sanitize(
      makeConfig({
        admin: {
          components: {
            views: {
              settings: { Component: './Settings#Custom', path: '/custom-settings' },
            },
          },
        },
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;

    expect(payloadConfig.admin.components.views.settings).toEqual({
      Component: './Settings#Custom',
      path: '/custom-settings',
    });
  });

  it.each(['', '/usage', '../usage', 'billing/../usage', 'billing//usage', 'billing\\usage'])(
    'rejects invalid settings path %j',
    (path) => {
      expect(() =>
        sanitize(
          makeConfig({ settings: [{ label: 'Usage', path, Component: './settings/Usage#Page' }] }),
        ),
      ).toThrow('must be a normalized relative path');
    },
  );

  it('rejects duplicate settings paths', () => {
    expect(() =>
      sanitize(
        makeConfig({
          settings: [
            { label: 'Usage', path: 'usage', Component: './settings/Usage#Page' },
            { label: 'Other', path: 'usage', Component: './settings/Other#Page' },
          ],
        }),
      ),
    ).toThrow("Duplicate settings path 'usage'");
  });

  it('rejects unknown built-in collection icons', () => {
    expect(() =>
      sanitize(
        makeConfig({
          collections: [
            { slug: 'users', auth: true, fields: [], admin: { icon: 'unknown' as never } },
          ],
        }),
      ),
    ).toThrowError("[frogbot] Unknown admin icon 'unknown'. Valid:");
  });

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
      { slug: 'files', auth: false },
    ]);
  });

  it('adds policy fields to the injected default users collection', async () => {
    const result = sanitize(
      makeConfig({
        collections: [{ slug: 'posts', fields: [] }],
        ai: { providers: { openai: { apiKey: 'test' } } },
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const users = payloadConfig.collections?.find(({ slug }) => slug === 'users');
    expect(users?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'modelAccess', defaultValue: 'all' }),
        expect.objectContaining({ name: 'models', hasMany: true }),
        expect.objectContaining({ name: 'monthlyBudget', min: 0 }),
        expect.objectContaining({ name: 'spendThisPeriodUSD', defaultValue: 0 }),
      ]),
    );
  });

  it('registers a monthly reset that updates the resolved auth collection', async () => {
    const result = sanitize(makeConfig({ ai: { providers: { openai: { apiKey: 'test' } } } }));
    const payloadConfig = await result._internal.payloadConfig;
    const task = payloadConfig.jobs?.tasks?.find(({ slug }) => slug === 'frogbot-reset-ai-budgets');
    const update = vi.fn();
    await task?.handler({ req: { payload: { update } } } as never);
    expect(task?.schedule).toEqual([{ cron: '0 0 1 * *', queue: 'frogbot-reset-ai-budgets' }]);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        data: { spendThisPeriodUSD: 0 },
        overrideAccess: true,
      }),
    );
  });

  it('preserves the secret in the sanitized config', () => {
    const config = makeConfig();
    const result = sanitize(config);
    expect(result.secret).toBe('test-secret');
  });

  it('injects and configures the default files collection', () => {
    const result = sanitize(makeConfig());
    expect(result.collections.map((collection) => collection.slug)).toContain('files');
    expect(result.files).toEqual({ slug: 'files' });
  });

  it('propagates an adopted files collection slug', () => {
    const result = sanitize(
      makeConfig({
        collections: [
          { slug: 'users', auth: true, fields: [] },
          { slug: 'documents', file: true, fields: [] },
        ],
      }),
    );
    expect(result.files).toEqual({ slug: 'documents' });
    expect(result.collections.map((collection) => collection.slug)).not.toContain('files');
  });

  it('stores a payloadConfig promise in _internal', () => {
    const config = makeConfig();
    const result = sanitize(config);
    expect(result._internal.payloadConfig).toBeInstanceOf(Promise);
  });

  it('keeps FrogBot-only values out of the Payload config', async () => {
    const execute = vi.fn();
    const result = sanitize(
      makeConfig({
        serverURL: 'https://example.com',
        tools: [
          {
            slug: 'search',
            description: 'Search',
            inputSchema: z.object({ query: z.string() }),
            execute,
          },
        ],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;

    expect(payloadConfig.serverURL).toBe('https://example.com');
    expect(payloadConfig).not.toHaveProperty('tools');
    expect(JSON.stringify(payloadConfig)).not.toContain('inputSchema');
    expect(JSON.stringify(payloadConfig)).not.toContain('search');
  });

  it('keeps repeated sanitization and codegen quiet when email is omitted', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      sanitize(makeConfig());
      sanitize(makeConfig());
      sanitize(makeConfig(), { mode: 'codegen' });

      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('installs the FrogBot noop email adapter when email is omitted', async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);
    const email = payloadConfig.email as unknown as (args: unknown) => {
      name: string;
    };

    expect(email({ payload }).name).toBe('frogbot-noop');
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
    const users = (payloadConfig as any).collections.find((c: any) => c.slug === 'users');
    const posts = (payloadConfig as any).collections.find((c: any) => c.slug === 'posts');
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
    const projects = (payloadConfig as any).collections.find((c: any) => c.slug === 'projects');
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
    const users = (payloadConfig as any).collections.find((c: any) => c.slug === 'users');
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
    const users = (payloadConfig as any).collections.find((c: any) => c.slug === 'users');
    const endpoints = users.endpoints as any[];
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].handler).not.toBe(handler);
  });

  it('wraps root-level custom endpoint handlers in the payload config', async () => {
    const handler = () => new Response('ok');
    const config = makeConfig({
      endpoints: [{ path: '/health', method: 'get', handler }],
    } as any);
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    const endpoints = (payloadConfig as any).endpoints as any[];
    expect(endpoints).toHaveLength(2);
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
    const endpoint = (
      payloadConfig as unknown as {
        endpoints: { handler: (req: unknown) => Promise<Response> }[];
      }
    ).endpoints[0];
    const payload = {};
    const frogbot = { agents: {} };
    registerFrogbotInstance(payload, frogbot as any);

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

  it('warns once through the initialized logger when Payload initialization omits email', async () => {
    resetFrogbotCache();
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);

    await payloadConfig.onInit?.(payload as never);
    await payloadConfig.onInit?.(payload as never);

    expect(emailWarnings(payload.logger.warn)).toHaveLength(1);
  });

  it('does not warn during Payload initialization when email is configured', async () => {
    resetFrogbotCache();
    const result = sanitize(makeConfig({ email: (() => ({})) as FrogbotConfig['email'] }));
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);

    await payloadConfig.onInit?.(payload as never);

    expect(emailWarnings(payload.logger.warn)).toHaveLength(0);
  });

  it('does not warn during production-build Payload initialization', async () => {
    resetFrogbotCache();
    const previousPhase = process.env.NEXT_PHASE;
    process.env.NEXT_PHASE = 'phase-production-build';
    try {
      const result = sanitize(makeConfig());
      const payloadConfig = await result._internal.payloadConfig;
      const payload = makePayload(payloadConfig);

      await payloadConfig.onInit?.(payload as never);

      expect(emailWarnings(payload.logger.warn)).toHaveLength(0);
    } finally {
      process.env.NEXT_PHASE = previousPhase;
    }
  });

  it('recovers endpoint requests when lifecycle registration is missing', async () => {
    resetFrogbotCache();
    const handler = vi.fn((req) => Response.json({ attached: Boolean(req.frogbot) }));
    const result = sanitize(
      makeConfig({ endpoints: [{ path: '/health', method: 'get', handler }] }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const endpoint = (payloadConfig as any).endpoints[0];
    const payload = makePayload(payloadConfig);

    const response = await endpoint.handler({ payload });

    await expect(response.json()).resolves.toEqual({ attached: true });
    expect(getFrogbotInstance(payload)).toBeDefined();
    expect(getCachedFrogbot()).toBe(getFrogbotInstance(payload));
  });

  it('recovers operations when lifecycle registration is missing', async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;
    const collection = payloadConfig.collections[0];
    const bootstrap = collection.hooks.beforeOperation[0];
    const payload = makePayload(payloadConfig);
    const req = { payload };

    await bootstrap({ req });

    expect(req).toHaveProperty('frogbot', getFrogbotInstance(payload));
  });

  it('deduplicates concurrent lazy registration', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onInit = vi.fn(() => pending);
    const handler = vi.fn(() => new Response('ok'));
    const result = sanitize(
      makeConfig({
        onInit,
        endpoints: [{ path: '/health', method: 'get', handler }],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const endpoint = (payloadConfig as any).endpoints[0];
    const payload = makePayload(payloadConfig);

    const first = endpoint.handler({ payload });
    const second = endpoint.handler({ payload });
    await vi.waitFor(() => expect(onInit).toHaveBeenCalledOnce());
    release();
    await Promise.all([first, second]);

    expect(onInit).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('propagates the real lazy initialization error', async () => {
    const error = new Error('real initialization failure');
    const handler = vi.fn(() => new Response('ok'));
    const result = sanitize(
      makeConfig({
        onInit: () => {
          throw error;
        },
        endpoints: [{ path: '/health', method: 'get', handler }],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const endpoint = (payloadConfig as any).endpoints[0];
    const payload = makePayload(payloadConfig);

    await expect(endpoint.handler({ payload })).rejects.toBe(error);
    expect(handler).not.toHaveBeenCalled();
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

    const args = {
      req,
      context: {},
      error: new Error('test'),
      result: { errors: [] },
    };
    const hookResponse = await payloadConfig.hooks.afterError[0](args);

    expect(afterError).toHaveBeenCalledWith({
      ...args,
      req: expect.objectContaining({ frogbot }),
    });
    expect(hookResponse).toBe(hookResult);
    expect(payload).not.toHaveProperty('frogbot');
  });

  it('drops the FrogBot plugins key from the payload config', async () => {
    const plugin = (c: FrogbotConfig) => c;
    const config = makeConfig({ plugins: [plugin] });
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    expect((payloadConfig as any).plugins).toBeUndefined();
  });

  it('rewrites @payloadcms component paths in the sanitized payload config', async () => {
    const config = makeConfig({
      admin: {
        dashboard: {
          widgets: [
            {
              slug: 'collections',
              Component: '@payloadcms/next/rsc#CollectionCards',
              minWidth: 'full',
            },
          ],
        },
      },
    } as unknown as Partial<FrogbotConfig>);
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    expect((payloadConfig as any).admin.dashboard.widgets[0].Component).toBe(
      '@frogbotai/next/rsc#CollectionCards',
    );
  });

  it('forces admin.importMap.autoGenerate false while preserving other admin keys', async () => {
    const config = makeConfig({
      admin: { theme: 'dark', importMap: { baseDir: '/tmp/base' } },
      routes: { api: '/internal' },
    } as unknown as Partial<FrogbotConfig>);
    const result = sanitize(config);
    const payloadConfig = await result._internal.payloadConfig;
    expect((payloadConfig as any).admin.importMap).toEqual({
      baseDir: '/tmp/base',
      autoGenerate: false,
    });
    expect((payloadConfig as any).admin.theme).toBe('dark');
    expect(payloadConfig.routes).toMatchObject({ admin: '/', api: '/internal' });

    const custom = sanitize(makeConfig({ routes: { admin: '/control' } }));
    expect((await custom._internal.payloadConfig).routes.admin).toBe('/control');
  });

  it('defaults FrogBot import-map generation to enabled', () => {
    const result = sanitize(makeConfig());

    expect(result.admin?.importMap?.autoGenerate).toBe(true);
  });

  it('preserves an explicit FrogBot import-map generation opt-out', async () => {
    const result = sanitize(
      makeConfig({
        admin: { importMap: { autoGenerate: false } },
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;

    expect(result.admin?.importMap?.autoGenerate).toBe(false);
    expect(payloadConfig.admin.importMap.autoGenerate).toBe(false);
  });

  it('defaults admin nav sections', async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;

    expect(
      (payloadConfig.admin.components as never as { navSections: string[] }).navSections,
    ).toEqual(['@frogbotai/next#CollectionsSection', '@frogbotai/next#RecentsSection']);
  });

  it('defaults the dashboard and resolved chat collection views', async () => {
    const result = sanitize(
      makeConfig({
        ai: { providers: { openai: true } },
        agents: [{ slug: 'support', model: 'openai/test', instructions: 'Help' }],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const chats = payloadConfig.collections.find(({ slug }) => slug === result.chat.chatsSlug);

    expect(payloadConfig.admin.components.views.dashboard).toEqual({
      Component: '@frogbotai/next/views#ChatView',
      path: '/',
    });
    expect(chats?.admin.components.views).toMatchObject({
      edit: { root: { Component: '@frogbotai/next/views#ChatView' } },
    });
    expect(chats?.admin.components.views.list).toEqual({
      Component: '@frogbotai/next/views#DefaultListView',
    });
  });

  it('defaults chat views on a marked custom collection', async () => {
    const result = sanitize(
      makeConfig({
        collections: [
          { slug: 'users', auth: true, fields: [] },
          { slug: 'conversations', chat: true, fields: [] },
        ],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const chats = payloadConfig.collections.find(({ slug }) => slug === 'conversations');

    expect(result.chat.chatsSlug).toBe('conversations');
    expect(chats?.admin.components.views).toMatchObject({
      edit: { root: { Component: '@frogbotai/next/views#ChatView' } },
    });
    expect(chats?.admin.components.views.list).toEqual({
      Component: '@frogbotai/next/views#DefaultListView',
    });
  });

  it('preserves dashboard, chat list, and chat edit root overrides', async () => {
    const dashboard = { Component: './Dashboard#Dashboard', path: '/' as const };
    const list = { Component: './ChatList#ChatList' };
    const root = { Component: './ChatEdit#ChatEdit' };
    const result = sanitize(
      makeConfig({
        admin: { components: { views: { dashboard } } },
        collections: [
          { slug: 'users', auth: true, fields: [] },
          {
            slug: 'conversations',
            chat: true,
            fields: [],
            admin: {
              components: { edit: { views: { root } } },
              views: [{ type: 'custom', component: list.Component, shell: false }],
            },
          },
        ],
      } as never),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const chats = payloadConfig.collections.find(({ slug }) => slug === 'conversations');

    expect(payloadConfig.admin.components.views.dashboard).toEqual(dashboard);
    expect(chats?.admin.components.views.list).toMatchObject({
      Component: '@frogbotai/next/views#CustomCollectionView',
    });
    expect(chats?.admin.components.views.edit.root).toEqual(root);
  });

  it('preserves configured admin nav sections and items', async () => {
    const result = sanitize(
      makeConfig({
        admin: {
          components: {
            afterBottomRail: ['./components/AfterBottom#AfterBottom'],
            beforeBottomRail: ['./components/BeforeBottom#BeforeBottom'],
            beforeSidebarClose: ['./components/BeforeClose#BeforeClose'],
            navItems: [{ label: 'Home', path: '/' }],
            navSections: ['./components/Section#Section'],
          },
        },
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const components = payloadConfig.admin.components as never as {
      navItems: { label: string; path: string }[];
      navSections: string[];
    };

    expect(components.navItems).toEqual([{ label: 'Home', path: '/' }]);
    expect(components.navSections).toEqual(['./components/Section#Section']);
    expect(payloadConfig.admin.components.afterBottomRail).toEqual([
      './components/AfterBottom#AfterBottom',
    ]);
    expect(payloadConfig.admin.components.beforeBottomRail).toEqual([
      './components/BeforeBottom#BeforeBottom',
    ]);
    expect(payloadConfig.admin.components.beforeSidebarClose).toEqual([
      './components/BeforeClose#BeforeClose',
    ]);
  });

  it('injects FrogBot branding defaults into the payload config', async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = (await result._internal.payloadConfig) as any;
    expect(payloadConfig.admin.components.graphics).toEqual({
      Icon: '@frogbotai/next/rsc#FrogbotIcon',
      Logo: '@frogbotai/next/rsc#FrogbotLogo',
    });
    expect(payloadConfig.admin.meta.titleSuffix).toBe('- FrogBot');
    expect(payloadConfig.admin.meta.defaultOGImageType).toBe('static');
    expect(payloadConfig.admin.meta.openGraph.siteName).toBe('FrogBot');
    expect(payloadConfig.i18n.translations.en.general.payloadSettings).toBe('FrogBot Settings');
  });

  it('defaults the cookie prefix to FrogBot', async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;

    expect(payloadConfig.cookiePrefix).toBe('frogbot');
  });

  it('lets a user cookie prefix override the FrogBot default', async () => {
    const result = sanitize(makeConfig({ cookiePrefix: 'acme' }));
    const payloadConfig = await result._internal.payloadConfig;

    expect(payloadConfig.cookiePrefix).toBe('acme');
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
      i18n: {
        translations: { en: { general: { payloadSettings: 'Acme Settings' } } },
      },
    } as unknown as Partial<FrogbotConfig>);
    const result = sanitize(config);
    const payloadConfig = (await result._internal.payloadConfig) as any;
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
        translations: {
          en: { general: { dashboard: 'Home' } },
          es: { general: { dashboard: 'Inicio' } },
        },
      },
    } as unknown as Partial<FrogbotConfig>);
    const result = sanitize(config);
    const payloadConfig = (await result._internal.payloadConfig) as any;
    expect(payloadConfig.i18n.fallbackLanguage).toBe('en');
    expect(payloadConfig.i18n.translations.en.general).toEqual({
      dashboard: 'Home',
      payloadSettings: 'FrogBot Settings',
    });
    expect(payloadConfig.i18n.translations.es).toEqual({
      general: { dashboard: 'Inicio' },
    });
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
    const bare = (payloadConfig as any).collections.find((c: any) => c.slug === 'bare');
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
    expect(slugs).toEqual(['alpha', 'beta', 'gamma', 'files']);
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

    it('rejects an undefined explicit apiKey', () => {
      const config = makeConfig({
        ai: { providers: { openai: { apiKey: undefined } } },
      });
      expect(() => sanitize(config)).toThrow(
        "[frogbot] Provider 'openai' requires a non-empty apiKey when configured with an object.",
      );
    });

    it('accepts true for SDK environment fallback', () => {
      const result = sanitize(makeConfig({ ai: { providers: { openai: true } } }));
      expect(result.ai?.providers.openai).toBe(true);
    });

    it('rejects false provider entries', () => {
      const config = makeConfig({
        ai: { providers: { openai: false } },
      } as never);
      expect(() => sanitize(config)).toThrow("Provider 'openai' must be true or an object");
    });

    it('rejects true for custom providers', () => {
      const config = makeConfig({
        ai: { providers: { internal: true } },
      } as never);
      expect(() => sanitize(config)).toThrow(
        "Custom provider 'internal' must have type: 'openai-compatible'",
      );
    });

    it('rejects an empty explicit apiKey', () => {
      const config = makeConfig({
        ai: { providers: { openai: { apiKey: '' } } },
      });
      expect(() => sanitize(config)).toThrow("Provider 'openai' requires a non-empty apiKey");
    });

    it('rejects a whitespace explicit apiKey', () => {
      const config = makeConfig({
        ai: { providers: { anthropic: { apiKey: '   ' } } },
      });
      expect(() => sanitize(config)).toThrow("Provider 'anthropic' requires a non-empty apiKey");
    });

    it('accepts Bedrock ambient credentials without static keys', () => {
      const config = makeConfig({ ai: { providers: { bedrock: true } } });
      expect(() => sanitize(config)).not.toThrow();
    });

    it('accepts a Bedrock credential provider without static keys', () => {
      const config = makeConfig({
        ai: {
          providers: {
            bedrock: {
              credentialProvider: () =>
                Promise.resolve({
                  accessKeyId: 'ak',
                  secretAccessKey: 'sk',
                }),
            },
          },
        },
      });
      expect(() => sanitize(config)).not.toThrow();
    });

    it('accepts catalogued built-in model allowlists', () => {
      const config = makeConfig({
        ai: {
          providers: {
            bedrock: {
              region: 'us-east-1',
              models: ['zai.glm-4.7-flash'],
            },
          },
        },
      });
      expect(() => sanitize(config)).not.toThrow();
    });

    it('rejects unknown built-in model allowlist entries', () => {
      const config = makeConfig({
        ai: {
          providers: {
            bedrock: {
              region: 'us-east-1',
              models: ['not-a-real-model'],
            },
          },
        },
      } as never);
      expect(() => sanitize(config)).toThrow(
        "Provider 'bedrock' models contains unknown model: not-a-real-model",
      );
    });

    it('rejects incomplete explicit Bedrock credentials', () => {
      const config = makeConfig({
        ai: { providers: { bedrock: { accessKeyId: 'ak' } } },
      } as never);
      expect(() => sanitize(config)).toThrow(
        "Provider 'bedrock' requires both accessKeyId and secretAccessKey",
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
      expect(() => sanitize(config)).toThrow(
        "[frogbot] Custom provider 'internal' requires a non-empty models array.",
      );
    });
  });

  describe('ai.defaultModel', () => {
    it('preserves a model that resolves through a configured router', () => {
      const result = sanitize(
        makeConfig({
          ai: {
            providers: { openai: true },
            routers: { fast: { model: 'openai/gpt-4o-mini' } },
            defaultModel: 'fast',
          },
        }),
      );

      expect(result.ai?.defaultModel).toBe('fast');
    });

    it('rejects a model that does not resolve to a configured provider or router', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai: { providers: { anthropic: true }, defaultModel: 'openai/gpt-4o-mini' },
          }),
        ),
      ).toThrow(
        "[frogbot] defaultModel 'openai/gpt-4o-mini' does not resolve to a configured provider or router.",
      );
    });

    it('keeps defaultModel absent when omitted', () => {
      const result = sanitize(makeConfig({ ai: { providers: { openai: true } } }));

      expect(result.ai?.defaultModel).toBeUndefined();
    });
  });

  describe('ai.smallModel', () => {
    it('preserves a model that resolves through a configured router', () => {
      const result = sanitize(
        makeConfig({
          ai: {
            providers: { openai: true },
            routers: { fast: { model: 'openai/gpt-5-nano' } },
            smallModel: 'fast',
          },
        }),
      );

      expect(result.ai?.smallModel).toBe('fast');
    });

    it('rejects a model that does not resolve to a configured provider or router', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai: { providers: { anthropic: true }, smallModel: 'openai/gpt-5-nano' },
          }),
        ),
      ).toThrow(
        "[frogbot] smallModel 'openai/gpt-5-nano' does not resolve to a configured provider or router.",
      );
    });

    it('keeps smallModel absent when omitted', () => {
      const result = sanitize(makeConfig({ ai: { providers: { openai: true } } }));

      expect(result.ai?.smallModel).toBeUndefined();
    });
  });

  describe('agents', () => {
    const ai = { providers: { openai: { apiKey: 'sk-test' } } };
    const agent = {
      slug: 'support',
      model: 'openai/test',
      instructions: 'Help the user',
    };
    const makeTool = (slug: string, overrides: Record<string, unknown> = {}) => ({
      slug,
      description: `Run ${slug}`,
      inputSchema: {},
      execute: vi.fn(),
      ...overrides,
    });

    it('preserves an agent model when configured', () => {
      const result = sanitize(makeConfig({ ai, agents: [agent] } as never));

      expect(result.agents?.[0]?.model).toBe('openai/test');
    });

    it('preserves allowed agent models', () => {
      const result = sanitize(
        makeConfig({ ai, agents: [{ ...agent, allowModels: ['openai/other'] }] } as never),
      );

      expect(result.agents?.[0]?.allowModels).toEqual(['openai/other']);
    });

    it('rejects an allowed model without a configured provider', () => {
      expect(() =>
        sanitize(
          makeConfig({ ai, agents: [{ ...agent, allowModels: ['anthropic/test'] }] } as never),
        ),
      ).toThrow(
        "[frogbot] Agent 'support' allowModels model 'anthropic/test' does not resolve to a configured provider.",
      );
    });

    it('uses ai.defaultModel when the agent model is omitted', () => {
      const result = sanitize(
        makeConfig({
          ai: { ...ai, defaultModel: 'openai/default' },
          agents: [{ slug: 'support', instructions: 'Help the user' }],
        } as never),
      );

      expect(result.agents?.[0]?.model).toBe('openai/default');
    });

    it('sanitizes and registers the general preset using ai.defaultModel', async () => {
      const result = sanitize(
        makeConfig({
          ai: { ...ai, defaultModel: 'openai/default' },
          agents: [general()],
        } as never),
      );
      const payloadConfig = await result._internal.payloadConfig;

      expect(result.agents?.[0]).toMatchObject({ slug: 'general', model: 'openai/default' });
      expect((payloadConfig as any).endpoints.map((endpoint: any) => endpoint.path)).toContain(
        '/agents/:slug',
      );
    });

    it('rejects an agent when neither agent model nor ai.defaultModel is configured', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [{ slug: 'support', instructions: 'Help the user' }],
          } as never),
        ),
      ).toThrow("[frogbot] Agent 'support' requires a `model` or `ai.defaultModel`.");
    });

    it('accepts an agent profile', () => {
      const profile = { name: 'Ada', avatar: '/ada.png', description: 'Support' };
      const result = sanitize(makeConfig({ ai, agents: [{ ...agent, profile }] } as never));
      expect(result.agents?.[0].profile).toEqual(profile);
    });

    it('accepts an omitted agent profile', () => {
      const result = sanitize(makeConfig({ ai, agents: [agent] } as never));
      expect((result.agents?.[0] as typeof agent & { profile?: unknown }).profile).toBeUndefined();
    });

    it('rejects a non-object agent profile', () => {
      expect(() =>
        sanitize(makeConfig({ ai, agents: [{ ...agent, profile: 'Ada' }] } as never)),
      ).toThrow("[frogbot] Agent 'support' profile must be an object.");
    });

    it('rejects blank agent profile fields', () => {
      expect(() =>
        sanitize(makeConfig({ ai, agents: [{ ...agent, profile: { name: '   ' } }] } as never)),
      ).toThrow("[frogbot] Agent 'support' profile name must be a non-empty string.");
    });

    it('adds root tools to every agent', () => {
      const shared = makeTool('shared');
      const result = sanitize(
        makeConfig({
          ai,
          agents: [agent, { ...agent, slug: 'sales' }],
          tools: [shared],
        } as never),
      );

      expect(result.agents?.map(({ tools }) => tools?.map(({ slug }) => slug))).toEqual([
        ['shared'],
        ['shared'],
      ]);
    });

    it('lets agent tools override root tools', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const rootExecute = vi.fn();
      const agentExecute = vi.fn();
      const result = sanitize(
        makeConfig({
          ai,
          agents: [{ ...agent, tools: [makeTool('shared', { execute: agentExecute })] }],
          tools: [makeTool('shared', { execute: rootExecute })],
        } as never),
      );

      expect(result.agents?.[0].tools).toHaveLength(1);
      expect(result.agents?.[0].tools?.[0].execute).toBe(agentExecute);
      expect(warn).toHaveBeenCalledWith(
        "[frogbot] Agent 'support' tool 'shared' shadows root tool 'shared'.",
      );
      warn.mockRestore();
    });

    it('projects tool components by effective agent toolset', async () => {
      const result = sanitize(
        makeConfig({
          ai,
          agents: [
            { ...agent, tools: [makeTool('agent', { component: '/AgentTool' })] },
            { ...agent, slug: 'sales' },
          ],
          tools: [makeTool('shared', { component: '/SharedTool' }), makeTool('plain')],
        } as never),
      );
      const payloadConfig = await result._internal.payloadConfig;

      expect((payloadConfig.admin?.components as any).chat.toolComponents).toEqual({
        sales: { shared: '/SharedTool' },
        support: { agent: '/AgentTool', shared: '/SharedTool' },
      });
    });

    it('allows agents to opt out of root tools', () => {
      const result = sanitize(
        makeConfig({
          ai,
          agents: [
            { ...agent, inheritTools: false },
            { ...agent, slug: 'sales' },
          ],
          tools: [makeTool('shared')],
        } as never),
      );

      expect(result.agents?.[0].tools).toBeUndefined();
      expect(result.agents?.[1].tools?.map(({ slug }) => slug)).toEqual(['shared']);
    });

    it('rejects an unregistered root piece tool', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [agent],
            tools: [makeTool('search', { pieceService: 'search' })],
          } as never),
        ),
      ).toThrow(
        "[frogbot] Root uses tool 'search' but no 'search' piece is registered in `pieces`.",
      );
    });

    it.each([undefined, []])('adds root tools when agent tools are %s', (tools) => {
      const result = sanitize(
        makeConfig({
          ai,
          agents: [{ ...agent, ...(tools === undefined ? {} : { tools }) }],
          tools: [makeTool('shared')],
        } as never),
      );

      expect(result.agents?.[0].tools?.map(({ slug }) => slug)).toEqual(['shared']);
    });

    it('rejects duplicate tool slugs within root and agent arrays', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [agent],
            tools: [makeTool('same'), makeTool('same')],
          } as never),
        ),
      ).toThrow("[frogbot] Duplicate tool slug 'same' in root.");
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [{ ...agent, tools: [makeTool('same'), makeTool('same')] }],
          } as never),
        ),
      ).toThrow("[frogbot] Duplicate tool slug 'same' in agent 'support'.");
    });

    it('sanitizes agents, defaults access, registers endpoints, and removes agents from Payload', async () => {
      const result = sanitize(makeConfig({ ai, agents: [agent] }));
      const payloadConfig = await result._internal.payloadConfig;

      expect(result.agents).toHaveLength(1);
      expect(result.agents?.[0].access).toBeTypeOf('function');
      expect((payloadConfig as any).agents).toBeUndefined();
      expect((payloadConfig as any).endpoints.map((endpoint: any) => endpoint.path)).toEqual([
        '/frogbot',
        '/agents/:slug',
        '/agents/:slug/authorizations',
        '/agents',
        '/frogbot/chat/branch',
        '/frogbot/chat/suggest-title',
      ]);
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
      expect(
        (payloadConfig as { endpoints?: { path: string }[] }).endpoints?.map(({ path }) => path),
      ).toEqual(['/frogbot']);
    });

    it.each([
      { endpoints: false as const, expected: ['/frogbot'] },
      {
        endpoints: [{ path: '/health', method: 'get' as const, handler: vi.fn() }],
        expected: ['/health', '/frogbot'],
      },
    ])(
      'preserves user endpoint configuration for empty agents',
      async ({ endpoints, expected }) => {
        const result = sanitize(makeConfig({ agents: [], endpoints }));
        const payloadConfig = await result._internal.payloadConfig;
        const payloadEndpoints = (payloadConfig as { endpoints?: false | { path: string }[] })
          .endpoints;

        expect(
          Array.isArray(payloadEndpoints)
            ? payloadEndpoints.map(({ path }) => path)
            : payloadEndpoints,
        ).toEqual(expected);
      },
    );

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

    it.each([
      [{ prompt: 'Run', handler: vi.fn() }, 'exactly one of prompt or handler'],
      [{}, 'exactly one of prompt or handler'],
      [
        { prompt: 'Run', schedule: { every: '1h', cron: '0 * * * *' } },
        'exactly one of every or cron',
      ],
      [{ prompt: 'Run', schedule: { cron: 'invalid' } }, 'invalid cron expression'],
      [
        { prompt: 'Run', schedule: { cron: '0 * * * *', timezone: 'UTC' } },
        'timezone is not yet supported',
      ],
    ])('rejects invalid trigger configuration', (trigger, message) => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [
              {
                ...agent,
                triggers: [
                  { type: 'schedule', slug: 'run', schedule: { every: '1h' }, ...trigger },
                ],
              },
            ],
          } as never),
        ),
      ).toThrow(message);
    });

    it('rejects duplicate and unsafe trigger slugs within an agent', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [
              {
                ...agent,
                triggers: [
                  { type: 'schedule', slug: 'same', schedule: { every: '1h' }, prompt: 'Run' },
                  { type: 'schedule', slug: 'same', schedule: { every: '1h' }, prompt: 'Run' },
                ],
              },
            ],
          }),
        ),
      ).toThrow("Duplicate trigger slug 'same'");
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [
              {
                ...agent,
                triggers: [
                  { type: 'schedule', slug: 'not safe', schedule: { every: '1h' }, prompt: 'Run' },
                ],
              },
            ],
          }),
        ),
      ).toThrow('is not URL-safe');
    });

    it('allows the same trigger slug on different agents', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: ['one', 'two'].map((slug) => ({
              ...agent,
              slug,
              triggers: [
                {
                  type: 'schedule' as const,
                  slug: 'run',
                  schedule: { every: '1h' as const },
                  prompt: 'Run',
                },
              ],
            })),
          }),
        ),
      ).not.toThrow();
    });

    it('rejects malformed skills', () => {
      for (const skills of [
        [{ slug: '', instructions: 'Use it' }],
        [{ slug: 'docs' }],
        [{ slug: 'docs', instructions: '' }],
      ]) {
        expect(() =>
          sanitize(
            makeConfig({
              ai,
              agents: [{ ...agent, skills }],
            } as never),
          ),
        ).toThrow("[frogbot] Agent 'support'");
      }
    });

    it('rejects duplicate and unsafe skill slugs', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [
              {
                ...agent,
                skills: [
                  { slug: 'docs', instructions: 'One' },
                  { slug: 'docs', instructions: 'Two' },
                ],
              },
            ],
          } as never),
        ),
      ).toThrow("Duplicate skill slug 'docs'");
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [{ ...agent, skills: [{ slug: 'not safe', instructions: 'Use it' }] }],
          } as never),
        ),
      ).toThrow('is not URL-safe');
    });

    it('allows the same skill slug on different agents', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: ['one', 'two'].map((slug) => ({
              ...agent,
              slug,
              skills: [{ slug: 'docs', instructions: 'Use it' }],
            })),
          } as never),
        ),
      ).not.toThrow();
    });

    it('rejects duplicate skill resource paths', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [
              {
                ...agent,
                skills: [
                  {
                    slug: 'docs',
                    instructions: 'Use it',
                    resources: [
                      { path: 'api.md', content: 'One' },
                      { path: 'api.md', content: 'Two' },
                    ],
                  },
                ],
              },
            ],
          } as never),
        ),
      ).toThrow("Duplicate resource path 'api.md'");
    });

    it.each(['list_skills', 'load_skill', 'load_skill_resource'])(
      'reserves the %s tool slug for skills',
      (slug) => {
        expect(() =>
          sanitize(
            makeConfig({
              ai,
              agents: [
                {
                  ...agent,
                  skills: [{ slug: 'docs', instructions: 'Use it' }],
                  tools: [makeTool(slug)],
                },
              ],
            } as never),
          ),
        ).toThrow(`[frogbot] Tool slug '${slug}' is reserved for agent skills.`);
      },
    );

    it('reserves skill tool names after root tool inheritance', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [{ ...agent, skills: [{ slug: 'docs', instructions: 'Use it' }] }],
            tools: [makeTool('load_skill')],
          } as never),
        ),
      ).toThrow("[frogbot] Tool slug 'load_skill' is reserved for agent skills.");
    });

    it('resolves skill tools and L1 instructions', () => {
      const result = sanitize(
        makeConfig({
          ai,
          agents: [
            {
              ...agent,
              skills: [
                { slug: 'docs', description: 'Product documentation', instructions: 'Use docs' },
                { slug: 'support', instructions: 'Support playbook' },
              ],
              tools: [makeTool('custom')],
            },
          ],
        } as never),
      );

      expect(result.agents?.[0].tools?.map(({ slug }) => slug)).toEqual([
        'custom',
        'list_skills',
        'load_skill',
        'load_skill_resource',
      ]);
      expect(result.agents?.[0].instructions).toBe(
        'Help the user\n\n- **docs**: Product documentation\n- **support**',
      );
    });

    it('keeps skill tools when root tool inheritance is disabled', () => {
      const result = sanitize(
        makeConfig({
          ai,
          agents: [
            {
              ...agent,
              inheritTools: false,
              skills: [{ slug: 'docs', instructions: 'Use docs' }],
            },
          ],
          tools: [makeTool('shared')],
        } as never),
      );

      expect(result.agents?.[0].tools?.map(({ slug }) => slug)).toEqual([
        'list_skills',
        'load_skill',
        'load_skill_resource',
      ]);
    });

    it('does not change agents with empty or absent skills', () => {
      const omitted = sanitize(makeConfig({ ai, agents: [agent] }));
      const empty = sanitize(
        makeConfig({
          ai,
          agents: [{ ...agent, skills: [] }],
        } as never),
      );

      expect(empty.agents?.[0].tools).toEqual(omitted.agents?.[0].tools);
      expect(empty.agents?.[0].instructions).toBe(omitted.agents?.[0].instructions);
    });

    it('reserves the schedule task slug and merges user jobs', async () => {
      const scheduled = {
        ...agent,
        triggers: [
          {
            type: 'schedule' as const,
            slug: 'run',
            schedule: { every: '1h' as const },
            prompt: 'Run',
          },
        ],
      };
      const handler = vi.fn();
      const result = sanitize(
        makeConfig({
          ai,
          agents: [scheduled],
          jobs: { tasks: [{ slug: 'user-task', handler }], autoRun: [{ queue: 'user' }] },
        }),
      );
      const payloadConfig = await result._internal.payloadConfig;
      expect(payloadConfig.jobs.tasks.map(({ slug }) => slug)).toEqual([
        'user-task',
        'frogbot-reset-ai-budgets',
        'frogbot-run-agent-schedule',
      ]);
      expect(payloadConfig.jobs.autoRun).toEqual([
        { queue: 'user' },
        { allQueues: true, cron: '* * * * *' },
      ]);
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [scheduled],
            jobs: { tasks: [{ slug: 'frogbot-run-agent-schedule', handler }] },
          }),
        ),
      ).toThrow('is reserved for agent schedule triggers');
    });

    it.each(['runtime', 'codegen'] as const)(
      'accepts an empty tools array during %s validation',
      (mode) => {
        const result = sanitize(
          makeConfig({
            ai,
            agents: [{ ...agent, tools: [] }],
          }),
          { mode },
        );

        expect(result.agents?.[0].tools).toEqual([]);
        expect(result.agents?.[0].access).toBeTypeOf('function');
      },
    );

    it('rejects non-array tools', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [{ ...agent, tools: null as never }],
          }),
        ),
      ).toThrow("[frogbot] Agent 'support' tools must be an array when configured.");
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
      ).toThrow(
        "[frogbot] Agent 'support' model 'openai/test' does not resolve to a configured provider.",
      );
    });

    it('rejects model mismatches at runtime', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai: { providers: { anthropic: true } },
            agents: [agent],
          }),
        ),
      ).toThrow(
        "[frogbot] Agent 'support' model 'openai/test' does not resolve to a configured provider. Configured providers: anthropic. Update the agent model or configure its provider under `ai.providers`.",
      );
    });

    it('warns with model mismatch details during codegen', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect(() =>
        sanitize(
          makeConfig({
            ai: { providers: { anthropic: true } },
            agents: [agent],
          }),
          { mode: 'codegen' },
        ),
      ).not.toThrow();
      expect(warn).toHaveBeenCalledWith(
        "[frogbot] Agent 'support' model 'openai/test' does not resolve to a configured provider. Configured providers: anthropic. Update the agent model or configure its provider under `ai.providers`.",
      );

      warn.mockRestore();
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

    it('reserves the manifest collection slug', () => {
      expect(() =>
        sanitize(
          makeConfig({
            collections: [{ slug: 'frogbot', fields: [] }],
          }),
        ),
      ).toThrow("[frogbot] Collection slug 'frogbot' is reserved for the manifest API.");
    });

    it.each(['/frogbot', '/frogbot/custom'])('reserves manifest endpoint path %s', (path) => {
      expect(() =>
        sanitize(
          makeConfig({
            endpoints: [{ path, method: 'get', handler: () => new Response() }],
          }),
        ),
      ).toThrow(`[frogbot] Endpoint path '${path}' is reserved for the manifest API.`);
    });

    it('reserves the v1 collection slug', () => {
      expect(() =>
        sanitize(
          makeConfig({
            collections: [{ slug: 'v1', fields: [] }],
          }),
        ),
      ).toThrow("[frogbot] Collection slug 'v1' is reserved for the AI gateway API.");
    });

    it.each(['/v1', '/v1/custom'])('reserves AI gateway endpoint path %s', (path) => {
      expect(() =>
        sanitize(
          makeConfig({
            endpoints: [{ path, method: 'get', handler: () => new Response() }],
          }),
        ),
      ).toThrow(`[frogbot] Endpoint path '${path}' is reserved for the AI gateway API.`);
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
      expect(result.chat).toEqual({
        enabled: true,
        chatsSlug: 'chats',
        messagesSlug: 'messages',
      });
    });

    it('resolves slugs from chat/message markers', () => {
      const result = sanitize(
        makeConfig({
          collections: [
            { slug: 'users', auth: true, fields: [] },
            { slug: 'conversations', chat: true, fields: [] },
            { slug: 'turns', message: true, fields: [] },
          ],
        }),
      );
      expect(result.chat).toEqual({
        enabled: true,
        chatsSlug: 'conversations',
        messagesSlug: 'turns',
      });
    });

    it('merges todos into a marked chat collection', async () => {
      const result = sanitize(
        makeConfig({
          collections: [
            { slug: 'users', auth: true, fields: [] },
            { slug: 'conversations', chat: true, fields: [] },
          ],
        }),
      );
      const payloadConfig = await result._internal.payloadConfig;
      const conversations = (payloadConfig as any).collections.find(
        (collection: any) => collection.slug === 'conversations',
      );
      expect(conversations.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'todos', type: 'json' })]),
      );
    });

    it('strips markers from adopted collections in the payload config', async () => {
      const result = sanitize(
        makeConfig({
          collections: [
            { slug: 'users', auth: true, fields: [] },
            { slug: 'conversations', chat: true, fields: [] },
          ],
        }),
      );
      const payloadConfig = await result._internal.payloadConfig;
      const conversations = (payloadConfig as any).collections.find(
        (c: any) => c.slug === 'conversations',
      );
      expect(conversations.chat).toBeUndefined();
    });

    it('injects chat collections into the payload config and collections metadata', async () => {
      const result = sanitize(makeConfig({ ai, agents }));
      expect(result.collections.map((c) => c.slug)).toEqual([
        'users',
        'chats',
        'messages',
        'usage-logs',
        'files',
      ]);
      const payloadConfig = await result._internal.payloadConfig;
      const payloadSlugs = (payloadConfig as any).collections.map((c: any) => c.slug);
      expect(payloadSlugs).toEqual(['users', 'chats', 'messages', 'usage-logs', 'files']);
    });

    it('injected chat collections get the bootstrap beforeOperation hook', async () => {
      const result = sanitize(makeConfig({ ai, agents }));
      const payloadConfig = await result._internal.payloadConfig;
      const chats = (payloadConfig as any).collections.find((c: any) => c.slug === 'chats');
      expect(chats.hooks?.beforeOperation?.length).toBeGreaterThan(0);
    });

    it('throws when an unmarked collection occupies a default chat slug', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents,
            collections: [
              { slug: 'users', auth: true, fields: [] },
              { slug: 'chats', fields: [] },
            ],
          }),
        ),
      ).toThrow(
        "[frogbot] Collection slug 'chats' conflicts with the default chat collection. Add `chat: true` to adopt it, or rename it.",
      );
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
