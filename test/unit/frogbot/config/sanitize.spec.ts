import { buildConfig as payloadBuildConfig, meOperation, MissingEditorProp } from 'payload';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { general } from '../../../../packages/frogbot/src/agents/presets/general.js';
import { catalog } from '../../../../packages/frogbot/src/ai/catalog.js';
import type { CollectionConfig } from '../../../../packages/frogbot/src/collections/config/types.js';
import { buildConfig } from '../../../../packages/frogbot/src/config/build.js';
import { compileCollectionViews } from '../../../../packages/frogbot/src/config/collectionViews.js';
import type { FrogBotConfig } from '../../../../packages/frogbot/src/config/types.js';
import type { FrogBot } from '../../../../packages/frogbot/src/frogbot.js';
import {
  getCachedFrogBot,
  resetFrogBotCache,
} from '../../../../packages/frogbot/src/getFrogBot.js';
import {
  getFrogBotInstance,
  registerFrogBotInstance,
} from '../../../../packages/frogbot/src/instanceRegistry.js';
import { definePiece } from '../../../../packages/frogbot/src/pieces/definePiece.js';

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  buildConfig: vi.fn((config: Record<string, unknown>) =>
    Promise.resolve({ globals: [], ...config }),
  ),
  handleEndpoints: vi.fn(),
}));

const { sanitize } = await import('../../../../packages/frogbot/src/config/sanitize.js');

const createEmail = definePiece({
  slug: 'mailer',
  label: 'Mailer',
  options: z.object({ from: z.string() }),
  actions: [],
  email: { async send() {} },
});

function makeConfig(overrides?: Partial<FrogBotConfig>): FrogBotConfig {
  return {
    secret: 'test-secret',
    db: {} as FrogBotConfig['db'],
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
  it('rejects rich text fields without an editor before the upstream build', () => {
    expect(() =>
      sanitize(
        makeConfig({
          collections: [
            {
              slug: 'posts',
              fields: [{ name: 'content', type: 'richText' }],
            },
          ],
        }),
      ),
    ).toThrow(
      "[frogbot] Rich text field 'content' in collection 'posts' requires a Lexical editor",
    );
  });

  it('translates upstream nested rich text editor errors', async () => {
    vi.mocked(payloadBuildConfig).mockRejectedValueOnce(
      new MissingEditorProp({ name: 'caption', type: 'richText' } as never),
    );

    const config = sanitize(
      makeConfig({
        editor: (() => {}) as never,
      }),
    );

    await expect(config._internal.payloadConfig).rejects.toThrow(
      '[frogbot] A nested rich text field requires an explicit Lexical editor',
    );
  });

  it('keeps the subscription ledger available without mounted triggers', async () => {
    const config = sanitize(makeConfig());
    const payloadConfig = await config._internal.payloadConfig;
    expect(
      payloadConfig.collections?.find(({ slug }) => slug === 'frogbot-trigger-subscriptions'),
    ).toMatchObject({ admin: { hidden: true } });
    expect(Object.keys(config._internal.triggers)).toEqual([]);
    expect(payloadConfig.endpoints).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '/webhooks/:instance' })]),
    );
  });

  it('reserves the subscription ledger slug without mounted triggers', () => {
    expect(() =>
      sanitize(
        makeConfig({ collections: [{ slug: 'frogbot-trigger-subscriptions', fields: [] }] }),
      ),
    ).toThrow("Collection slug 'frogbot-trigger-subscriptions' is reserved");
  });

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
  it('leaves calendar-only collections non-orderable', async () => {
    const result = sanitize(
      makeConfig({
        collections: [
          {
            slug: 'events',
            fields: [{ name: 'startsAt', type: 'date' }],
            admin: { views: [{ type: 'calendar', start: 'startsAt' }] },
          },
        ],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const events = payloadConfig.collections?.find(({ slug }) => slug === 'events');

    expect(events?.orderable).toBeUndefined();
    expect(events?.fields.some((field) => 'name' in field && field.name.startsWith('_order'))).toBe(
      false,
    );
    expect(events?.admin.components?.views?.list).toEqual({
      Component: '@frogbotai/next/views#CalendarView',
    });
    expect((events?.admin.custom?.frogbot as any).views[0]).not.toHaveProperty('orderField');
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

  it.each(['message-square', 'MessageSquareText'])(
    'rejects the near-miss collection icon %s with the valid names list',
    (icon) => {
      const config = makeConfig({
        collections: [{ slug: 'users', auth: true, fields: [], admin: { icon: icon as never } }],
      });

      expect(() => sanitize(config)).toThrowError(`[frogbot] Unknown admin icon '${icon}'. Valid:`);
      expect(() => sanitize(config)).toThrowError(/Valid:.*message-square-text/);
    },
  );

  it('rejects unknown built-in nav item icons', () => {
    const config = makeConfig({
      admin: {
        components: { navItems: [{ icon: 'hmoe' as never, label: 'Home', path: '/home' }] },
      },
    });

    expect(() => sanitize(config)).toThrowError("[frogbot] Unknown admin icon 'hmoe'. Valid:");
  });

  it('rejects unknown built-in settings icons', () => {
    const config = makeConfig({
      settings: [
        { icon: 'Robot' as never, label: 'Usage', path: 'usage', Component: './Usage#Page' },
      ],
    });

    expect(() => sanitize(config)).toThrowError("[frogbot] Unknown admin icon 'Robot'. Valid:");
  });

  it('accepts built-in names and component icons on nav items and settings', () => {
    const config = makeConfig({
      collections: [
        { slug: 'users', auth: true, fields: [] },
        { slug: 'api-keys', fields: [], admin: { icon: 'key-round' } },
        { slug: 'notes', fields: [], admin: { icon: 'message-square-text' } },
        { slug: 'support-tickets', fields: [], admin: { icon: 'bubble-chat' } },
      ],
      admin: {
        components: {
          navItems: [
            { icon: 'home', label: 'Home', path: '/home' },
            { icon: './components/HomeIcon.tsx#HomeIcon', label: 'Custom', path: '/custom' },
            { icon: { path: './Icon.tsx', exportName: 'Icon' }, label: 'Object', path: '/object' },
          ],
        },
      },
      settings: [
        { icon: 'robot', label: 'Robot', path: 'robot', Component: './Robot#Page' },
        { icon: './UsageIcon#UsageIcon', label: 'Usage', path: 'usage', Component: './Usage#Page' },
      ],
    });

    expect(() => sanitize(config)).not.toThrow();
  });

  it.each([
    ['a wrong-case name', 'Home'],
    ['a default-export path without #', './Icon.tsx'],
  ])('rejects %s as a nav item icon', (_, icon) => {
    const config = makeConfig({
      admin: { components: { navItems: [{ icon, label: 'Home', path: '/home' }] } },
    });

    expect(() => sanitize(config)).toThrowError(`[frogbot] Unknown admin icon '${icon}'. Valid:`);
  });

  it('accepts a default-export component path and empty icons', () => {
    const config = makeConfig({
      admin: {
        components: {
          navItems: [
            { icon: './Icon.tsx#default', label: 'Default', path: '/default' },
            { icon: '', label: 'Empty', path: '/empty' },
          ],
        },
      },
      collections: [{ slug: 'users', auth: true, fields: [], admin: { icon: '' } }],
      settings: [
        { icon: '', label: 'Empty', path: 'empty', Component: './Empty#Page' },
        {
          icon: { path: './UsageIcon', exportName: 'UsageIcon' },
          label: 'Usage',
          path: 'usage',
          Component: './Usage#Page',
        },
      ],
    });

    expect(() => sanitize(config)).not.toThrow();
  });

  it('throws `[frogbot] `globals` is not a FrogBot concept` when `globals` is present', () => {
    const config = makeConfig() as unknown as Record<string, unknown>;
    config.globals = [{ slug: 'site', fields: [] }];
    expect(() => sanitize(config as unknown as FrogBotConfig)).toThrowError(
      '[frogbot] `globals` is not a FrogBot concept',
    );
  });

  it('throws when admin.livePreview.globals is set', () => {
    const config = makeConfig({
      admin: { livePreview: { globals: ['site'] } },
    } as unknown as Partial<FrogBotConfig>);

    expect(() => sanitize(config)).toThrowError(
      '[frogbot] `admin.livePreview.globals` is not a FrogBot concept. Use `collections` instead.',
    );
  });

  it('carries root admin.livePreview into the payload config', async () => {
    const livePreview = {
      collections: ['pages'],
      openByDefault: true,
      url: '/pages',
    };
    const result = sanitize(makeConfig({ admin: { livePreview } }));
    const payloadConfig = await result._internal.payloadConfig;

    expect(payloadConfig.admin.livePreview).toEqual(livePreview);
  });

  it('carries collection admin.livePreview into the payload collection', async () => {
    const livePreview = { openByDefault: true, url: '/pages' };
    const result = sanitize(
      makeConfig({
        collections: [{ slug: 'pages', fields: [], admin: { livePreview } }],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const pages = payloadConfig.collections.find(({ slug }) => slug === 'pages');

    expect(pages?.admin.livePreview).toEqual(livePreview);
  });

  it('attaches req.frogbot before calling a root livePreview url', async () => {
    const url = vi.fn(({ req }) => (req.frogbot ? '/pages' : null));
    const result = sanitize(makeConfig({ admin: { livePreview: { url } } }));
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);
    const frogbot = { agents: {} };
    registerFrogBotInstance(payload, frogbot as unknown as FrogBot);

    const resolved = await (
      payloadConfig.admin.livePreview?.url as (args: Record<string, unknown>) => Promise<unknown>
    )({
      data: {},
      locale: { code: 'en', label: 'English' },
      req: { payload },
    });

    expect(resolved).toBe('/pages');
    expect(url).toHaveBeenCalledWith(
      expect.objectContaining({ req: expect.objectContaining({ frogbot }) }),
    );
  });

  it('attaches req.frogbot before calling a collection livePreview url', async () => {
    const url = vi.fn(({ req }) => (req.frogbot ? '/pages' : null));
    const result = sanitize(
      makeConfig({
        collections: [{ slug: 'pages', fields: [], admin: { livePreview: { url } } }],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);
    const frogbot = { agents: {} };
    registerFrogBotInstance(payload, frogbot as unknown as FrogBot);
    const pages = payloadConfig.collections.find(({ slug }) => slug === 'pages');

    const resolved = await (
      pages?.admin.livePreview?.url as (args: Record<string, unknown>) => Promise<unknown>
    )({
      collectionConfig: pages,
      data: {},
      locale: { code: 'en', label: 'English' },
      req: { payload },
    });

    expect(resolved).toBe('/pages');
    expect(url).toHaveBeenCalledWith(
      expect.objectContaining({ req: expect.objectContaining({ frogbot }) }),
    );
  });

  it('leaves a string livePreview url untouched', async () => {
    const result = sanitize(makeConfig({ admin: { livePreview: { url: '/pages' } } }));
    const payloadConfig = await result._internal.payloadConfig;

    expect(payloadConfig.admin.livePreview?.url).toBe('/pages');
  });

  it('propagates a livePreview url rejection to the caller', async () => {
    const error = new Error('preview failed');
    const result = sanitize(
      makeConfig({
        admin: {
          livePreview: {
            url: () => Promise.reject(error),
          },
        },
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);
    registerFrogBotInstance(payload, { agents: {} } as unknown as FrogBot);

    const pending = (
      payloadConfig.admin.livePreview?.url as (args: Record<string, unknown>) => Promise<unknown>
    )({
      data: {},
      locale: { code: 'en', label: 'English' },
      req: { payload },
    });

    await expect(pending).rejects.toBe(error);
  });

  describe('admin.preview', () => {
    async function sanitizePreview(admin: NonNullable<CollectionConfig['admin']>) {
      const result = sanitize(
        makeConfig({
          collections: [
            { slug: 'users', auth: true, fields: [] },
            { slug: 'pages', fields: [], admin },
          ],
        }),
      );

      const payloadConfig = await result._internal.payloadConfig;
      const payload = makePayload(payloadConfig);
      const frogbot = { agents: {} };

      registerFrogBotInstance(payload, frogbot as unknown as FrogBot);

      const pages = payloadConfig.collections.find(({ slug }) => slug === 'pages')!;

      return {
        frogbot,
        payload,
        preview: pages.admin.preview as unknown,
      };
    }

    it('attaches req.frogbot before calling a collection admin.preview', async () => {
      const preview = vi.fn((_doc, { req }) => (req.frogbot ? '/preview' : null));
      const sanitized = await sanitizePreview({ preview });
      const req = { payload: sanitized.payload };

      expect(req).not.toHaveProperty('frogbot');

      const resolved = await (sanitized.preview as (...args: unknown[]) => Promise<unknown>)(
        { id: 'page-1' },
        { locale: 'en', req, token: 'jwt' },
      );

      expect(resolved).toBe('/preview');
      expect(preview).toHaveBeenCalledExactlyOnceWith(
        { id: 'page-1' },
        {
          locale: 'en',
          req: expect.objectContaining({ frogbot: sanitized.frogbot }),
          token: 'jwt',
        },
      );
    });

    it('leaves a missing admin.preview missing', async () => {
      const sanitized = await sanitizePreview({});

      expect(sanitized.preview).toBeUndefined();
    });

    it('leaves a non-function admin.preview untouched', async () => {
      const sanitized = await sanitizePreview({ preview: '/static' as never });

      expect(sanitized.preview).toBe('/static');
    });

    it('propagates an admin.preview rejection to the caller', async () => {
      const error = new Error('preview failed');
      const sanitized = await sanitizePreview({ preview: () => Promise.reject(error) });

      const pending = (sanitized.preview as (...args: unknown[]) => Promise<unknown>)(
        {},
        { locale: 'en', req: { payload: sanitized.payload }, token: null },
      );

      await expect(pending).rejects.toBe(error);
    });
  });

  describe('collection and localization request functions', () => {
    type RuntimeFunction = (...args: any[]) => any;

    type RecordedArgs = { req: { frogbot?: unknown } };

    async function sanitizeRequestFunctions(
      collection: Omit<CollectionConfig, 'fields' | 'slug'>,
      overrides?: Partial<FrogBotConfig>,
    ) {
      const result = sanitize(
        makeConfig({
          collections: [{ slug: 'pages', fields: [], ...collection }],
          ...overrides,
        }),
      );

      const payloadConfig = await result._internal.payloadConfig;
      const payload = makePayload(payloadConfig);
      const frogbot = { agents: {} };

      registerFrogBotInstance(payload, frogbot as unknown as FrogBot);

      const pages = payloadConfig.collections.find(({ slug }) => slug === 'pages')!;

      return {
        frogbot,
        localization: payloadConfig.localization as Record<string, any> | false | undefined,
        pages: pages as unknown as Record<string, any>,
        req: { payload } as Record<string, unknown>,
      };
    }

    it('gives admin.formatDocURL req.frogbot and keeps it synchronous', async () => {
      const formatDocURL = vi.fn((args: RecordedArgs & { defaultURL: string }) =>
        args.req.frogbot ? args.defaultURL : null,
      );
      const sanitized = await sanitizeRequestFunctions({ admin: { formatDocURL } });

      expect(sanitized.req).not.toHaveProperty('frogbot');

      const url = (sanitized.pages.admin.formatDocURL as RuntimeFunction)({
        collectionSlug: 'pages',
        defaultURL: '/collections/pages/1',
        doc: { id: 1 },
        req: sanitized.req,
        viewType: 'list',
      });

      expect(url).toBe('/collections/pages/1');
      expect(formatDocURL).toHaveBeenCalledExactlyOnceWith({
        collectionSlug: 'pages',
        defaultURL: '/collections/pages/1',
        doc: { id: 1 },
        req: expect.objectContaining({ frogbot: sanitized.frogbot }),
        viewType: 'list',
      });
    });

    it('gives every upload handler req.frogbot and returns its response', async () => {
      const response = new Response('file');
      const first = vi.fn(() => undefined);
      const second = vi.fn((req: RecordedArgs['req']) => (req.frogbot ? response : undefined));
      const sanitized = await sanitizeRequestFunctions({
        upload: { handlers: [first, second] as never },
      });
      const args = { doc: { id: 1 }, params: { collection: 'pages', filename: 'a.png' } };

      expect(sanitized.req).not.toHaveProperty('frogbot');

      const [wrappedFirst, wrappedSecond] = sanitized.pages.upload.handlers as RuntimeFunction[];
      const results = [
        await wrappedFirst(sanitized.req, args),
        await wrappedSecond(sanitized.req, args),
      ];

      expect(results).toEqual([undefined, response]);
      expect(first).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ frogbot: sanitized.frogbot }),
        args,
      );
    });

    it('leaves an upload config without handlers untouched', async () => {
      const sanitized = await sanitizeRequestFunctions({ upload: true });

      expect(sanitized.pages.upload).toBe(true);
    });

    it('gives verify and forgot-password email templates req.frogbot', async () => {
      const template = () =>
        vi.fn((args: RecordedArgs & { token: string }) =>
          args.req.frogbot ? `token ${args.token}` : 'missing',
        );
      const verifyHTML = template();
      const verifySubject = template();
      const resetHTML = template();
      const resetSubject = template();
      const sanitized = await sanitizeRequestFunctions({
        auth: {
          verify: { generateEmailHTML: verifyHTML, generateEmailSubject: verifySubject },
          forgotPassword: {
            expiration: 600_000,
            generateEmailHTML: resetHTML,
            generateEmailSubject: resetSubject,
          },
        },
      });
      const { forgotPassword, verify } = sanitized.pages.auth;

      expect(sanitized.req).not.toHaveProperty('frogbot');

      const results = await Promise.all(
        [
          verify.generateEmailHTML,
          verify.generateEmailSubject,
          forgotPassword.generateEmailHTML,
          forgotPassword.generateEmailSubject,
        ].map((fn: RuntimeFunction) => fn({ req: sanitized.req, token: 'abc', user: { id: 1 } })),
      );

      expect(results).toEqual(['token abc', 'token abc', 'token abc', 'token abc']);
      expect(forgotPassword.expiration).toBe(600_000);
      expect(resetHTML).toHaveBeenCalledExactlyOnceWith({
        req: expect.objectContaining({ frogbot: sanitized.frogbot }),
        token: 'abc',
        user: { id: 1 },
      });
    });

    it('keeps verify: true and auth configs without templates as they are', async () => {
      const sanitized = await sanitizeRequestFunctions({
        auth: { verify: true, forgotPassword: { expiration: 600_000 } },
      });

      expect(sanitized.pages.auth.verify).toBe(true);
      expect(sanitized.pages.auth.forgotPassword).toEqual({ expiration: 600_000 });
    });

    it('gives localization.filterAvailableLocales req.frogbot', async () => {
      const locales = [{ code: 'en', label: 'English' }];
      const filterAvailableLocales = vi.fn((args: RecordedArgs & { locales: typeof locales }) =>
        args.req.frogbot ? args.locales : [],
      );
      const sanitized = await sanitizeRequestFunctions(
        {},
        { localization: { defaultLocale: 'en', locales: ['en'], filterAvailableLocales } },
      );

      expect(sanitized.req).not.toHaveProperty('frogbot');

      const filtered = await (
        (sanitized.localization as Record<string, any>).filterAvailableLocales as RuntimeFunction
      )({ locales, req: sanitized.req });

      expect(filtered).toBe(locales);
      expect(filterAvailableLocales).toHaveBeenCalledExactlyOnceWith({
        locales,
        req: expect.objectContaining({ frogbot: sanitized.frogbot }),
      });
    });

    it('passes localization without filterAvailableLocales through unchanged', async () => {
      const localization = { defaultLocale: 'en', locales: ['en'] };
      const sanitized = await sanitizeRequestFunctions({}, { localization });

      expect(sanitized.localization).toBe(localization);
    });
  });

  describe('field request functions', () => {
    type RuntimeField = Record<string, any>;

    type RecordedArgs = { req: { frogbot?: unknown } };

    const recordFrogBot = () => vi.fn((args: RecordedArgs) => Boolean(args.req.frogbot));

    async function sanitizeFields(
      fields: CollectionConfig['fields'],
      overrides?: Partial<FrogBotConfig>,
    ) {
      const result = sanitize(
        makeConfig({
          collections: [
            { slug: 'users', auth: true, fields: [] },
            { slug: 'pages', fields },
          ],
          ...overrides,
        }),
      );

      const payloadConfig = await result._internal.payloadConfig;
      const payload = makePayload(payloadConfig);
      const frogbot = { agents: {} };

      registerFrogBotInstance(payload, frogbot as unknown as FrogBot);

      const pages = payloadConfig.collections.find(({ slug }) => slug === 'pages')!;

      return {
        blocks: (payloadConfig.blocks ?? []) as RuntimeField[],
        fields: pages.fields as RuntimeField[],
        frogbot,
        payload,
        req: { payload } as Record<string, unknown>,
      };
    }

    function findField(fields: RuntimeField[], name: string): RuntimeField {
      return fields.find((field) => field.name === name)!;
    }

    it('gives a defaultValue function req.frogbot on a bare request', async () => {
      const defaultValue = recordFrogBot();
      const sanitized = await sanitizeFields([
        { name: 'status', type: 'text', defaultValue: defaultValue as never },
      ]);

      expect(sanitized.req).not.toHaveProperty('frogbot');

      const value = await findField(sanitized.fields, 'status').defaultValue({
        locale: 'en',
        req: sanitized.req,
        user: null,
      });

      expect(value).toBe(true);
      expect(defaultValue).toHaveBeenCalledExactlyOnceWith({
        locale: 'en',
        req: expect.objectContaining({ frogbot: sanitized.frogbot }),
        user: null,
      });
    });

    it('gives relationship, upload, select and blocks filterOptions req.frogbot', async () => {
      const relationship = recordFrogBot();
      const upload = recordFrogBot();
      const select = vi.fn((args: RecordedArgs & { options: string[] }) =>
        args.req.frogbot ? args.options : [],
      );
      const blocks = vi.fn((args: RecordedArgs) => (args.req.frogbot ? ['hero'] : []));

      const sanitized = await sanitizeFields([
        {
          name: 'owner',
          type: 'relationship',
          relationTo: 'users',
          filterOptions: relationship as never,
        },
        { name: 'image', type: 'upload', relationTo: 'users', filterOptions: upload as never },
        { name: 'color', type: 'select', options: ['red'], filterOptions: select as never },
        { name: 'layout', type: 'blocks', blocks: [], filterOptions: blocks as never },
      ]);

      expect(sanitized.req).not.toHaveProperty('frogbot');

      const results = await Promise.all(
        ['owner', 'image', 'color', 'layout'].map((name) =>
          findField(sanitized.fields, name).filterOptions({
            options: ['red'],
            req: sanitized.req,
          }),
        ),
      );

      expect(results).toEqual([true, true, ['red'], ['hero']]);
    });

    it('gives a validate function req.frogbot and forwards the value and options', async () => {
      const validate = vi.fn((_value: unknown, options: RecordedArgs) =>
        options.req.frogbot ? true : 'missing',
      );
      const sanitized = await sanitizeFields([
        { name: 'title', type: 'text', validate: validate as never },
      ]);

      expect(sanitized.req).not.toHaveProperty('frogbot');

      const result = await findField(sanitized.fields, 'title').validate('Hello', {
        operation: 'create',
        req: sanitized.req,
      });

      expect(result).toBe(true);
      expect(validate).toHaveBeenCalledExactlyOnceWith('Hello', {
        operation: 'create',
        req: expect.objectContaining({ frogbot: sanitized.frogbot }),
      });
    });

    it('gives field access functions req.frogbot', async () => {
      const create = recordFrogBot();
      const read = recordFrogBot();
      const update = recordFrogBot();
      const sanitized = await sanitizeFields([
        {
          name: 'secret',
          type: 'text',
          access: { create: create as never, read: read as never, update: update as never },
        },
      ]);

      expect(sanitized.req).not.toHaveProperty('frogbot');

      const { access } = findField(sanitized.fields, 'secret');
      const results = [access.create, access.read, access.update].map((fn) =>
        fn({ req: sanitized.req }),
      );

      expect(results).toEqual([true, true, true]);
    });

    it('keeps a sync select filterOptions and field access.read sync', async () => {
      const sanitized = await sanitizeFields([
        {
          name: 'color',
          type: 'select',
          options: ['red'],
          access: { read: (() => true) as never },
          filterOptions: (({ options }: { options: string[] }) => options) as never,
        },
      ]);

      const color = findField(sanitized.fields, 'color');
      const options = color.filterOptions({ options: ['red'], req: sanitized.req });
      const allowed = color.access.read({ req: sanitized.req });

      expect(options).toEqual(['red']);
      expect(allowed).toBe(true);
    });

    it('wraps field functions nested in array, group, tabs, blocks and blockReferences', async () => {
      const defaultValue = recordFrogBot();
      const leaf = () => ({
        name: 'leaf',
        type: 'text' as const,
        defaultValue: defaultValue as never,
      });

      const sanitized = await sanitizeFields([
        { name: 'items', type: 'array', fields: [leaf()] },
        { name: 'meta', type: 'group', fields: [leaf()] },
        {
          type: 'tabs',
          tabs: [
            {
              label: 'Content',
              fields: [
                {
                  name: 'sections',
                  type: 'array',
                  fields: [
                    {
                      name: 'layout',
                      type: 'blocks',
                      blocks: [{ slug: 'deep', fields: [leaf()] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: 'references',
          type: 'blocks',
          blocks: [],
          blockReferences: ['hero', { slug: 'inline', fields: [leaf()] }],
        },
      ]);

      const [items, meta, tabs, references] = sanitized.fields;
      const leaves = [
        items.fields[0],
        meta.fields[0],
        tabs.tabs[0].fields[0].fields[0].blocks[0].fields[0],
        references.blockReferences[1].fields[0],
      ];

      const results = await Promise.all(
        leaves.map((field) => field.defaultValue({ req: { payload: sanitized.payload } })),
      );

      expect(results).toEqual([true, true, true, true]);
      expect(references.blockReferences[0]).toBe('hero');
    });

    it('wraps field functions in root blocks', async () => {
      const defaultValue = recordFrogBot();
      const sanitized = await sanitizeFields([], {
        blocks: [
          {
            slug: 'hero',
            fields: [{ name: 'title', type: 'text', defaultValue: defaultValue as never }],
          },
        ],
      });

      const value = await sanitized.blocks[0].fields[0].defaultValue({ req: sanitized.req });

      expect(value).toBe(true);
    });

    it('keeps static defaultValue, Where filterOptions and block slug arrays by identity', async () => {
      const settings = { theme: 'dark' };
      const where = { role: { equals: 'admin' } };
      const slugs = ['hero'];
      const sanitized = await sanitizeFields([
        { name: 'settings', type: 'json', defaultValue: settings },
        { name: 'owner', type: 'relationship', relationTo: 'users', filterOptions: where },
        { name: 'layout', type: 'blocks', blocks: [], filterOptions: slugs },
        { name: 'status', type: 'text', defaultValue: 'draft' },
      ]);

      expect(findField(sanitized.fields, 'settings').defaultValue).toBe(settings);
      expect(findField(sanitized.fields, 'owner').filterOptions).toBe(where);
      expect(findField(sanitized.fields, 'layout').filterOptions).toBe(slugs);
      expect(findField(sanitized.fields, 'status').defaultValue).toBe('draft');
    });

    it('calls through unchanged when the request has no payload', async () => {
      const defaultValue = vi.fn((args: { req: unknown }) => args.req);
      const sanitized = await sanitizeFields([
        { name: 'status', type: 'text', defaultValue: defaultValue as never },
      ]);
      const req = {};

      const value = await findField(sanitized.fields, 'status').defaultValue({ req });

      expect(value).toBe(req);
      expect(req).not.toHaveProperty('frogbot');
    });

    it('throws a [frogbot] error when no instance is registered and none is attached', async () => {
      const sanitized = await sanitizeFields([
        { name: 'status', type: 'text', defaultValue: (() => 'draft') as never },
      ]);
      const status = findField(sanitized.fields, 'status');

      expect(() => status.defaultValue({ req: { payload: {} } })).toThrow('[frogbot]');
    });

    it('keeps an attached req.frogbot when no instance is registered', async () => {
      const defaultValue = vi.fn((args: RecordedArgs) => args.req.frogbot);
      const sanitized = await sanitizeFields([
        { name: 'status', type: 'text', defaultValue: defaultValue as never },
      ]);
      const attached = { agents: {} };
      const req = { frogbot: attached, payload: {} };

      const value = await findField(sanitized.fields, 'status').defaultValue({ req });

      expect(value).toBe(attached);
      expect(defaultValue.mock.calls[0][0].req).toBe(req);
    });

    it('does not stack wrappers when sanitized fields are sanitized again', async () => {
      const defaultValue = recordFrogBot();
      const first = await sanitizeFields([
        { name: 'status', type: 'text', defaultValue: defaultValue as never },
      ]);
      const wrapped = findField(first.fields, 'status').defaultValue;

      const second = await sanitizeFields(first.fields as CollectionConfig['fields']);

      expect(findField(second.fields, 'status').defaultValue).toBe(wrapped);
    });

    it('gives field functions the current instance after a config refresh swaps it', async () => {
      const defaultValue = vi.fn((args: RecordedArgs) => args.req.frogbot);
      const fields: CollectionConfig['fields'] = [
        { name: 'status', type: 'text', defaultValue: defaultValue as never },
      ];
      const first = await sanitizeFields(fields);
      const staleReq = { payload: first.payload } as Record<string, unknown>;

      expect(findField(first.fields, 'status').defaultValue({ req: staleReq })).toBe(first.frogbot);

      const refreshed = sanitize(
        makeConfig({
          collections: [
            { slug: 'users', auth: true, fields: [] },
            { slug: 'pages', fields },
          ],
        }),
      );
      const refreshedPages = (await refreshed._internal.payloadConfig).collections.find(
        ({ slug }) => slug === 'pages',
      )!;
      const current = { agents: {} } as unknown as FrogBot;

      registerFrogBotInstance(first.payload, current, refreshed);

      const oldWrapper = findField(first.fields, 'status').defaultValue;
      const newWrapper = findField(refreshedPages.fields as RuntimeField[], 'status').defaultValue;

      expect(oldWrapper({ req: staleReq })).toBe(current);
      expect(newWrapper({ req: { payload: first.payload } })).toBe(current);
      expect(staleReq.frogbot).toBe(current);
      expect(getCachedFrogBot()).toBe(current);
    });
  });

  it('returns a FrogBotSanitizedConfig with collections metadata', () => {
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
      { slug: 'frogbot-trigger-subscriptions', auth: false },
      { slug: 'frogbot-waitpoints', auth: false },
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

  it('gives Monthly Spend the shared cost cell and field', async () => {
    const result = sanitize(
      makeConfig({
        collections: [{ slug: 'posts', fields: [] }],
        ai: { providers: { openai: { apiKey: 'test' } } },
      }),
    );

    const payloadConfig = await result._internal.payloadConfig;
    const users = payloadConfig.collections?.find(({ slug }) => slug === 'users');
    const spend = users?.fields.find(
      (field) => 'name' in field && field.name === 'spendThisPeriodUSD',
    );

    expect(spend).toMatchObject({
      admin: {
        readOnly: true,
        components: {
          Cell: '@frogbotai/next/client#CostUSDCell',
          Field: '@frogbotai/next/client#CostUSDField',
        },
      },
    });
  });

  it("keeps an app's own Monthly Spend admin components", async () => {
    const result = sanitize(
      makeConfig({
        collections: [
          {
            slug: 'users',
            auth: true,
            fields: [
              {
                name: 'spendThisPeriodUSD',
                type: 'number',
                admin: { components: { Cell: '/components/SpendCell#SpendCell' } },
              },
            ],
          },
        ],
        ai: { providers: { openai: { apiKey: 'test' } } },
      }),
    );

    const payloadConfig = await result._internal.payloadConfig;
    const users = payloadConfig.collections?.find(({ slug }) => slug === 'users');
    const spend = users?.fields.find(
      (field) => 'name' in field && field.name === 'spendThisPeriodUSD',
    ) as { admin?: { readOnly?: boolean; components?: Record<string, unknown> } } | undefined;

    expect(spend?.admin?.components?.Cell).toBe('/components/SpendCell#SpendCell');
    expect(spend?.admin?.components?.Field).toBeUndefined();
    expect(spend?.admin?.readOnly).toBe(true);
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

  it.each([false, true])(
    'bridges an email piece before initialization (promised: %s)',
    async (promised) => {
      const piece = createEmail({ from: 'sender@example.com' });
      const resolvePiece = vi.fn(() => piece);
      const email = promised ? Promise.resolve().then(resolvePiece) : piece;
      const result = sanitize(makeConfig({ email }));
      const payloadConfig = await result._internal.payloadConfig;
      const adapter = await payloadConfig.email;
      const payload = makePayload(payloadConfig);

      expect(result._internal.noEmail).toBe(false);
      expect(adapter).toBeTypeOf('function');
      expect(adapter!({ payload: payload as never })).toMatchObject({
        name: 'mailer',
        defaultFromAddress: 'sender@example.com',
        defaultFromName: 'mailer',
      });
      expect(await payloadConfig.email).toBe(adapter);
      expect(resolvePiece).toHaveBeenCalledTimes(promised ? 1 : 0);
    },
  );

  it.each([null, false, '', () => ({})])('rejects an invalid email config: %s', (email) => {
    expect(() =>
      sanitize(makeConfig({ email: email as unknown as FrogBotConfig['email'] })),
    ).toThrow('email must be a piece that implements email');
  });

  it.each([
    { email: () => ({}), error: 'email must be a piece that implements email' },
    {
      email: definePiece({ slug: 'quickbooks', label: 'QuickBooks', actions: [] })(),
      error: "Piece 'quickbooks' does not implement email",
    },
    {
      email: definePiece({
        slug: 'no-sender',
        label: 'No sender',
        actions: [],
        email: { async send() {} },
      })(),
      error: "Piece 'no-sender' is used as email but has no from",
    },
  ])('applies the same validation to promised values: $error', async ({ email, error }) => {
    const result = sanitize(
      makeConfig({ email: Promise.resolve(email) as FrogBotConfig['email'] }),
    );
    const payloadConfig = await result._internal.payloadConfig;

    await expect(payloadConfig.email).rejects.toThrow(error);
  });

  it('propagates a rejected email promise', async () => {
    const error = new Error('email configuration failed');
    const result = sanitize(makeConfig({ email: Promise.reject(error) }));
    const payloadConfig = await result._internal.payloadConfig;

    await expect(payloadConfig.email).rejects.toBe(error);
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

  it('prepends the FrogBot setup hook to afterMe, afterLogout, and afterError when declared', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const result = sanitize(
      makeConfig({
        collections: [
          {
            slug: 'users',
            auth: true,
            fields: [],
            hooks: {
              afterMe: [first, second],
              afterLogout: [first, second],
              afterError: [first, second],
            },
          },
        ],
      }),
    );

    const payloadConfig = await result._internal.payloadConfig;
    const users = payloadConfig.collections.find(({ slug }) => slug === 'users')!;
    const payload = makePayload(payloadConfig);
    const frogbot = { agents: {} };

    registerFrogBotInstance(payload, frogbot as unknown as FrogBot);

    for (const phase of ['afterMe', 'afterLogout', 'afterError'] as const) {
      const hooks = users.hooks[phase]!;
      const req = { payload };

      const setupResult = await hooks[0]!({ req } as never);

      expect(hooks).toHaveLength(3);
      expect(hooks[1]).toBe(first);
      expect(hooks[2]).toBe(second);
      expect(req).toHaveProperty('frogbot', frogbot);
      expect(setupResult).toBeUndefined();
    }

    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('leaves afterMe, afterLogout, and afterError unset when no hooks are declared', async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;
    const users = payloadConfig.collections.find(({ slug }) => slug === 'users')!;

    expect(users.hooks.afterMe).toBeUndefined();
    expect(users.hooks.afterLogout).toBeUndefined();
    expect(users.hooks.afterError).toBeUndefined();
  });

  it('sets up an afterMe hook appended by a plugin before the hook runs', async () => {
    const afterMe = vi.fn(({ req, response }) => {
      expect(req.frogbot).toBe(frogbot);

      return response;
    });
    const result = await buildConfig(
      makeConfig({
        plugins: [
          (config) => ({
            ...config,
            collections: config.collections.map((collection) => ({
              ...collection,
              hooks: {
                ...collection.hooks,
                afterMe: [...(collection.hooks?.afterMe ?? []), afterMe],
              },
            })),
          }),
        ],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const users = payloadConfig.collections.find(({ slug }) => slug === 'users')!;
    const payload = makePayload(payloadConfig);
    const frogbot = { agents: {} };

    registerFrogBotInstance(payload, frogbot as unknown as FrogBot);

    const response = await meOperation({
      collection: { config: users },
      req: { payload, user: null, context: {} },
    } as never);

    expect(users.hooks.afterMe).toHaveLength(2);
    expect(users.hooks.afterMe![1]).toBe(afterMe);
    expect(afterMe).toHaveBeenCalledOnce();
    expect(response).toEqual({ user: null });
  });

  it('reproduces missing FrogBot in anonymous afterMe when only the setup hook is removed', async () => {
    const observed: unknown[] = [];
    const result = sanitize(
      makeConfig({
        collections: [
          {
            slug: 'users',
            auth: true,
            fields: [],
            hooks: {
              afterMe: [({ req }) => void observed.push(req.frogbot)],
            },
          },
        ],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const users = payloadConfig.collections.find(({ slug }) => slug === 'users')!;
    const payload = makePayload(payloadConfig);
    const frogbot = { agents: {} };

    registerFrogBotInstance(payload, frogbot as unknown as FrogBot);

    const withoutSetup = {
      ...users,
      hooks: { ...users.hooks, afterMe: users.hooks.afterMe!.slice(1) },
    };

    const before = await meOperation({
      collection: { config: withoutSetup },
      req: { payload, user: null, context: {} },
    } as never);
    const after = await meOperation({
      collection: { config: users },
      req: { payload, user: null, context: {} },
    } as never);

    expect(before).toEqual({ user: null });
    expect(after).toEqual(before);
    expect(observed).toEqual([undefined, frogbot]);
  });

  it('leaves empty afterMe, afterLogout, and afterError arrays unchanged', async () => {
    const hooks = { afterMe: [], afterLogout: [], afterError: [] };
    const result = sanitize(
      makeConfig({ collections: [{ slug: 'users', auth: true, fields: [], hooks }] }),
    );

    const payloadConfig = await result._internal.payloadConfig;
    const users = payloadConfig.collections.find(({ slug }) => slug === 'users')!;

    expect(users.hooks.afterMe).toBe(hooks.afterMe);
    expect(users.hooks.afterLogout).toBe(hooks.afterLogout);
    expect(users.hooks.afterError).toBe(hooks.afterError);
  });

  it('the setup hook skips a request without payload', async () => {
    const onInit = vi.fn();
    const result = sanitize(makeConfig({ onInit }));
    const payloadConfig = await result._internal.payloadConfig;
    const users = payloadConfig.collections.find(({ slug }) => slug === 'users')!;
    const req = {};

    await expect(users.hooks.beforeOperation[0]!({ req } as never)).resolves.toBeUndefined();

    expect(req).not.toHaveProperty('frogbot');
    expect(onInit).not.toHaveBeenCalled();
  });

  it('attaches req.frogbot before a collection access function runs', async () => {
    const accessResult = { tenant: { equals: 'acme' } };
    const read = vi.fn(({ req }) => {
      expect(req.frogbot).toBeDefined();

      return accessResult;
    });
    const result = sanitize(
      makeConfig({
        collections: [{ slug: 'users', auth: true, access: { read }, fields: [] }],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const users = payloadConfig.collections.find(({ slug }) => slug === 'users')!;
    const payload = makePayload(payloadConfig);
    const req = { payload };

    const actual = await users.access.read({ req } as never);

    expect(actual).toBe(accessResult);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ req }));
  });

  it('attaches req.frogbot before Payload default collection access runs', async () => {
    const defaultRead = vi.fn(({ req }) => Boolean(req.frogbot));

    vi.mocked(payloadBuildConfig).mockImplementationOnce(async (config) => {
      config.collections[0]!.access = {
        ...config.collections[0]!.access,
        read: defaultRead,
      };

      return { globals: [], ...config } as never;
    });

    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;
    const users = payloadConfig.collections.find(({ slug }) => slug === 'users')!;
    const payload = makePayload(payloadConfig);

    await expect(users.access.read({ req: { payload } } as never)).resolves.toBe(true);
    expect(defaultRead).toHaveBeenCalledOnce();
  });

  it('leaves collection access calls without a Payload request unchanged', async () => {
    const error = new Error('access failed');
    const read = vi.fn(() => {
      throw error;
    });
    const result = sanitize(
      makeConfig({
        collections: [{ slug: 'users', auth: true, access: { read }, fields: [] }],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const users = payloadConfig.collections.find(({ slug }) => slug === 'users')!;
    const args = { req: {} };

    await expect(users.access.read(args as never)).rejects.toBe(error);
    expect(read).toHaveBeenCalledWith(args);
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

    expect(endpoints).toHaveLength(5);
    expect(endpoints.find(({ path }) => path === '/health').handler).not.toBe(handler);
  });

  it('binds endpoint requests to the FrogBot instance for their Payload instance', async () => {
    const handler = vi.fn(() => new Response('ok'));
    const result = sanitize(
      makeConfig({
        endpoints: [{ path: '/health', method: 'get', handler }],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const endpoint = (
      payloadConfig as unknown as {
        endpoints: { path: string; handler: (req: unknown) => Promise<Response> }[];
      }
    ).endpoints.find(({ path }) => path === '/health')!;

    const payload = {};
    const frogbot = { agents: {} };
    registerFrogBotInstance(payload, frogbot as any);

    await endpoint.handler({ payload });

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ frogbot }));
    expect(payload).not.toHaveProperty('frogbot');
  });

  it('registers and caches FrogBot during Payload initialization', async () => {
    resetFrogBotCache();
    const onInit = vi.fn();
    const result = sanitize(makeConfig({ onInit }));
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);

    await payloadConfig.onInit?.(payload as never);

    const frogbot = getFrogBotInstance(payload);
    expect(frogbot).toBeDefined();
    expect(getCachedFrogBot()).toBe(frogbot);
    expect(onInit).toHaveBeenCalledOnce();
  });

  it('initializes a Payload instance idempotently', async () => {
    resetFrogBotCache();
    const onInit = vi.fn();
    const result = sanitize(makeConfig({ onInit }));
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);

    await payloadConfig.onInit?.(payload as never);
    const first = getFrogBotInstance(payload);
    await payloadConfig.onInit?.(payload as never);

    expect(first).toBeDefined();
    expect(getFrogBotInstance(payload)).toBe(first);
    expect(onInit).toHaveBeenCalledOnce();
  });

  it('warns once through the initialized logger when Payload initialization omits email', async () => {
    resetFrogBotCache();
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);

    await payloadConfig.onInit?.(payload as never);
    await payloadConfig.onInit?.(payload as never);

    expect(emailWarnings(payload.logger.warn)).toHaveLength(1);
  });

  it.each([false, true])(
    'does not warn during Payload initialization when email is configured (promised: %s)',
    async (promised) => {
      resetFrogBotCache();
      const piece = createEmail({ from: 'sender@example.com' });
      const result = sanitize(makeConfig({ email: promised ? Promise.resolve(piece) : piece }));
      const payloadConfig = await result._internal.payloadConfig;
      const payload = makePayload(payloadConfig);

      await payloadConfig.onInit?.(payload as never);

      expect(emailWarnings(payload.logger.warn)).toHaveLength(0);
    },
  );

  it('does not warn during production-build Payload initialization', async () => {
    resetFrogBotCache();
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
    resetFrogBotCache();
    const handler = vi.fn((req) => Response.json({ attached: Boolean(req.frogbot) }));
    const result = sanitize(
      makeConfig({ endpoints: [{ path: '/health', method: 'get', handler }] }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const endpoint = (payloadConfig.endpoints || []).find(({ path }) => path === '/health')!;

    const payload = makePayload(payloadConfig);

    const response = await endpoint.handler({ payload } as never);

    await expect(response.json()).resolves.toEqual({ attached: true });
    expect(getFrogBotInstance(payload)).toBeDefined();
    expect(getCachedFrogBot()).toBe(getFrogBotInstance(payload));
  });

  it('recovers operations when lifecycle registration is missing', async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;
    const collection = payloadConfig.collections[0];
    const bootstrap = collection.hooks.beforeOperation[0];
    const payload = makePayload(payloadConfig);
    const req = { payload };

    await bootstrap({ req });

    expect(req).toHaveProperty('frogbot', getFrogBotInstance(payload));
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
    const endpoint = (payloadConfig.endpoints || []).find(({ path }) => path === '/health')!;

    const payload = makePayload(payloadConfig);

    const first = endpoint.handler({ payload } as never);
    const second = endpoint.handler({ payload } as never);
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
    const endpoint = (payloadConfig.endpoints || []).find(({ path }) => path === '/health')!;

    const payload = makePayload(payloadConfig);

    await expect(endpoint.handler({ payload } as never)).rejects.toBe(error);
    expect(handler).not.toHaveBeenCalled();
  });

  it('binds root afterError requests without nesting FrogBot on Payload', async () => {
    const hookResult = { status: 418 };
    const afterError = vi.fn(() => hookResult);
    const result = sanitize(makeConfig({ hooks: { afterError: [afterError] } }));
    const payloadConfig = await result._internal.payloadConfig;
    const payload = makePayload(payloadConfig);
    const frogbot = { agents: {} };
    registerFrogBotInstance(payload, frogbot as unknown as FrogBot);
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
    const plugin = (c: FrogBotConfig) => c;
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
    } as unknown as Partial<FrogBotConfig>);
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
    } as unknown as Partial<FrogBotConfig>);
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

  it('defaults admin nav sections to the Collections section', async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;

    expect(
      (payloadConfig.admin.components as never as { navSections: string[] }).navSections,
    ).toEqual(['@frogbotai/next#CollectionsSection']);
  });

  it('preserves configured admin nav sections', async () => {
    const navSections = ['@frogbotai/next#CollectionsSection', '@frogbotai/next#RecentsSection'];
    const result = sanitize(makeConfig({ admin: { components: { navSections } } } as never));
    const payloadConfig = await result._internal.payloadConfig;

    expect(
      (payloadConfig.admin.components as never as { navSections: string[] }).navSections,
    ).toEqual(navSections);
  });

  it('preserves empty admin nav sections', async () => {
    const result = sanitize(makeConfig({ admin: { components: { navSections: [] } } } as never));
    const payloadConfig = await result._internal.payloadConfig;

    expect(
      (payloadConfig.admin.components as never as { navSections: string[] }).navSections,
    ).toEqual([]);
  });

  it('adds the step-nav reset provider when no providers are configured', async () => {
    const result = sanitize(makeConfig());
    const payloadConfig = await result._internal.payloadConfig;

    expect(payloadConfig.admin.components.providers).toEqual([
      '@frogbotai/next/client#StepNavReset',
    ]);
  });

  it('appends the step-nav reset provider after configured providers in order', async () => {
    const providers = ['./providers/Theme#Theme', './providers/Analytics#Analytics'];
    const result = sanitize(makeConfig({ admin: { components: { providers } } } as never));
    const payloadConfig = await result._internal.payloadConfig;

    expect(payloadConfig.admin.components.providers).toEqual([
      ...providers,
      '@frogbotai/next/client#StepNavReset',
    ]);
  });

  it('keeps the step-nav reset provider when the admin Nav is replaced', async () => {
    const result = sanitize(
      makeConfig({ admin: { components: { Nav: './components/Nav#Nav' } } } as never),
    );
    const payloadConfig = await result._internal.payloadConfig;

    expect(payloadConfig.admin.components.Nav).toBe('./components/Nav#Nav');
    expect(payloadConfig.admin.components.providers).toContain(
      '@frogbotai/next/client#StepNavReset',
    );
  });

  it('defaults to the collections dashboard and the resolved chat collection views', async () => {
    const { buildConfig } = await vi.importActual<typeof import('payload')>('payload');

    vi.mocked(payloadBuildConfig).mockImplementationOnce(buildConfig);

    const result = sanitize(
      makeConfig({
        ai: { providers: { openai: true } },
        agents: [{ slug: 'support', model: 'openai/gpt-5.4-mini', instructions: 'Help' }],
      }),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const chats = payloadConfig.collections.find(({ slug }) => slug === result.chat.chatsSlug);

    expect(payloadConfig.admin.components.views.dashboard).toBeUndefined();
    expect(payloadConfig.admin.dashboard.widgets).toContainEqual(
      expect.objectContaining({
        Component: '@frogbotai/next/rsc#CollectionCards',
        slug: 'collections',
      }),
    );
    expect(chats?.admin.components.views).toMatchObject({
      edit: { root: { Component: '@frogbotai/next/views#ChatView' } },
    });
    expect(chats?.admin.components.views.list).toEqual({
      Component: '@frogbotai/next/views#DefaultListView',
    });
  });

  it('selects a custom dashboard view over an explicit modular dashboard', async () => {
    const dashboardView = { Component: './Dashboard#Dashboard', path: '/' as const };
    const result = sanitize(
      makeConfig({
        admin: {
          dashboard: {
            widgets: [{ Component: './Widget#Widget', slug: 'summary' }],
          },
          components: { views: { dashboard: dashboardView } },
        },
      } as never),
    );
    const payloadConfig = await result._internal.payloadConfig;

    expect(payloadConfig.admin.components.views.dashboard).toEqual(dashboardView);
    expect(payloadConfig.admin.dashboard.widgets).toHaveLength(1);
  });

  it('preserves a Chat dashboard view at the admin root', async () => {
    const dashboardView = { Component: '@frogbotai/next/views#ChatView', path: '/' as const };
    const result = sanitize(
      makeConfig({ admin: { components: { views: { dashboard: dashboardView } } } } as never),
    );
    const payloadConfig = await result._internal.payloadConfig;

    expect(payloadConfig.admin.components.views.dashboard).toEqual(dashboardView);
  });

  it('keeps configured dashboard widgets without a dashboard view', async () => {
    const result = sanitize(
      makeConfig({
        admin: {
          dashboard: {
            widgets: [{ Component: './Widget#Widget', slug: 'summary' }],
          },
        },
      } as never),
    );
    const payloadConfig = await result._internal.payloadConfig;

    expect(payloadConfig.admin.components.views.dashboard).toBeUndefined();
    expect(payloadConfig.admin.dashboard.widgets).toHaveLength(1);
  });

  it('returns a default dashboard layout with the same req.frogbot request', async () => {
    const defaultLayout = vi.fn(({ req }) => [
      {
        data: { collectionCount: Object.keys(req.frogbot.collections).length },
        widgetSlug: 'summary',
        width: 'small',
      },
    ]);
    const result = sanitize(
      makeConfig({
        admin: {
          dashboard: {
            defaultLayout,
            widgets: [{ Component: './Widget#Widget', slug: 'summary' }],
          },
        },
      } as never),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const req = { payload: makePayload(payloadConfig), context: {} } as never;

    const layout = await payloadConfig.admin.dashboard.defaultLayout({ req });

    expect(layout).toEqual([
      {
        data: { collectionCount: expect.any(Number) },
        widgetSlug: 'summary',
        width: 'small',
      },
    ]);
    expect(defaultLayout).toHaveBeenCalledWith({ req });
  });

  it('preserves errors from the default dashboard layout', async () => {
    const error = new Error('layout failed');
    const defaultLayout = vi.fn(({ req }) => {
      expect(req.frogbot).toBeDefined();

      throw error;
    });
    const result = sanitize(
      makeConfig({
        admin: {
          dashboard: {
            defaultLayout,
            widgets: [{ Component: './Widget#Widget', slug: 'summary' }],
          },
        },
      } as never),
    );
    const payloadConfig = await result._internal.payloadConfig;
    const req = { payload: makePayload(payloadConfig), context: {} } as never;

    await expect(payloadConfig.admin.dashboard.defaultLayout({ req })).rejects.toBe(error);
    expect(defaultLayout).toHaveBeenCalledWith({ req });
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
      Icon: '@frogbotai/next/rsc#FrogBotIcon',
      Logo: '@frogbotai/next/rsc#FrogBotLogo',
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
    } as unknown as Partial<FrogBotConfig>);
    const result = sanitize(config);
    const payloadConfig = (await result._internal.payloadConfig) as any;
    expect(payloadConfig.admin.components.graphics).toEqual({
      Icon: '@frogbotai/next/rsc#FrogBotIcon',
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
    } as unknown as Partial<FrogBotConfig>);
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
    expect(slugs).toEqual([
      'alpha',
      'beta',
      'gamma',
      'frogbot-trigger-subscriptions',
      'frogbot-waitpoints',
      'files',
    ]);
  });

  describe('ai.providers', () => {
    it('accepts TypeSafe AI environment credentials and defaults evaluation access to authenticated users', () => {
      const result = sanitize(makeConfig({ ai: { providers: { 'typesafe-ai': true } } }));

      expect(result.ai?.providers['typesafe-ai']).toBe(true);
      expect(result.ai?.access.evaluate({ req: { user: { id: 'user-1' } } } as never)).toBe(true);
      expect(result.ai?.access.evaluate({ req: { user: null } } as never)).toBe(false);
    });

    it('accepts TypeSafe AI explicit credentials and catalogued evaluation allowlists', () => {
      const result = sanitize(
        makeConfig({
          ai: {
            providers: { 'typesafe-ai': { apiKey: 'ts-test', models: ['jev', 'jev-latest'] } },
            access: { evaluate: () => false },
          },
        }),
      );

      expect(result.ai?.providers['typesafe-ai']).toEqual({
        apiKey: 'ts-test',
        models: ['jev', 'jev-latest'],
      });
      expect(result.ai?.access.evaluate({ req: { user: { id: 'user-1' } } } as never)).toBe(false);
    });

    it('rejects TypeSafe AI object configuration without an explicit credential', () => {
      expect(() =>
        sanitize(makeConfig({ ai: { providers: { 'typesafe-ai': { apiKey: undefined } } } })),
      ).toThrow("Provider 'typesafe-ai' requires a non-empty apiKey");
    });

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

    it.each(['input', 'output'] as const)(
      "rejects the removed 'file' type in custom model %s modalities",
      (direction) => {
        const modalities = { input: ['text'], output: ['text'], [direction]: ['text', 'file'] };
        const config = makeConfig({
          ai: {
            providers: {
              internal: {
                type: 'openai-compatible',
                baseUrl: 'https://models.test',
                models: [{ id: 'reader', mode: 'chat', modalities }],
              },
            },
          },
        } as never);

        expect(() => sanitize(config)).toThrow(
          "[frogbot] Model 'reader' for custom provider 'internal' uses the type 'file'. Rename it to 'pdf'.",
        );
      },
    );

    it("accepts the 'pdf' type in custom model modalities", () => {
      const config = makeConfig({
        ai: {
          providers: {
            internal: {
              type: 'openai-compatible',
              baseUrl: 'https://models.test',
              models: [
                {
                  id: 'reader',
                  mode: 'chat',
                  modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
                },
              ],
            },
          },
        },
      });

      expect(() => sanitize(config)).not.toThrow();
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
    const rejections = [
      {
        name: 'a model outside the provider models list',
        ai: { providers: { openai: { apiKey: 'k', models: ['gpt-5-mini'] } } },
        smallModel: 'openai/gpt-5-nano',
        message: "[frogbot] ai.smallModel 'openai/gpt-5-nano' is not configured.",
      },
      {
        name: 'a model of an unconfigured provider',
        ai: { providers: { anthropic: true } },
        smallModel: 'openai/gpt-5-nano',
        message: "[frogbot] ai.smallModel 'openai/gpt-5-nano' is not configured.",
      },
      {
        name: 'a router to an unconfigured provider',
        ai: { providers: { anthropic: true }, routers: { fast: { model: 'openai/gpt-5-nano' } } },
        smallModel: 'fast',
        message: "[frogbot] ai.smallModel 'fast' is not configured.",
      },
      {
        name: 'a transcription model',
        ai: { providers: { openai: true } },
        smallModel: 'openai/whisper-1',
        message: "[frogbot] ai.smallModel 'openai/whisper-1' is not a chat model.",
      },
      {
        name: 'a router to a transcription model',
        ai: { providers: { openai: true }, routers: { stt: { model: 'openai/whisper-1' } } },
        smallModel: 'stt',
        message: "[frogbot] ai.smallModel 'stt' is not a chat model.",
      },
    ];

    afterEach(() => {
      vi.restoreAllMocks();
    });

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

    it('preserves a configured chat model', () => {
      const result = sanitize(
        makeConfig({
          ai: {
            providers: { openai: { apiKey: 'k', models: ['gpt-5-nano'] } },
            smallModel: 'openai/gpt-5-nano',
          },
        }),
      );

      expect(result.ai?.smallModel).toBe('openai/gpt-5-nano');
    });

    it.each(rejections)('rejects $name', ({ ai, smallModel, message }) => {
      const config = makeConfig({ ai: { ...ai, smallModel } as never });

      expect(() => sanitize(config)).toThrow(message);
    });

    it.each(rejections)('warns and keeps $name during codegen', ({ ai, smallModel, message }) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const config = makeConfig({ ai: { ...ai, smallModel } as never });

      const result = sanitize(config, { mode: 'codegen' });

      expect(result.ai?.smallModel).toBe(smallModel);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(message);
    });

    it('keeps smallModel absent when omitted', () => {
      const result = sanitize(makeConfig({ ai: { providers: { openai: true } } }));

      expect(result.ai?.smallModel).toBeUndefined();
    });
  });

  describe('ai.transcriptionModel', () => {
    const rejections = [
      {
        name: 'a model outside the provider models list',
        ai: { providers: { groq: { apiKey: 'k', models: ['whisper-large-v3'] } } },
        transcriptionModel: 'groq/whisper-large-v3-turbo',
        message: "[frogbot] ai.transcriptionModel 'groq/whisper-large-v3-turbo' is not configured.",
      },
      {
        name: 'a router to an unconfigured provider',
        ai: { providers: { anthropic: true }, routers: { stt: { model: 'openai/whisper-1' } } },
        transcriptionModel: 'stt',
        message: "[frogbot] ai.transcriptionModel 'stt' is not configured.",
      },
      {
        name: 'a chat model',
        ai: { providers: { openai: true } },
        transcriptionModel: 'openai/gpt-4o-mini',
        message:
          "[frogbot] ai.transcriptionModel 'openai/gpt-4o-mini' is not a transcription model.",
      },
      {
        name: 'a router to a chat model',
        ai: { providers: { openai: true }, routers: { fast: { model: 'openai/gpt-4o-mini' } } },
        transcriptionModel: 'fast',
        message: "[frogbot] ai.transcriptionModel 'fast' is not a transcription model.",
      },
    ];

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('keeps transcriptionModel absent when omitted', () => {
      const result = sanitize(makeConfig({ ai: { providers: { openai: true } } }));

      expect(result.ai?.transcriptionModel).toBeUndefined();
    });

    it('preserves a configured transcription model', () => {
      const result = sanitize(
        makeConfig({
          ai: {
            providers: { openai: true },
            transcriptionModel: 'openai/gpt-4o-mini-transcribe',
          },
        }),
      );

      expect(result.ai?.transcriptionModel).toBe('openai/gpt-4o-mini-transcribe');
    });

    it('preserves a router to a transcription model', () => {
      const result = sanitize(
        makeConfig({
          ai: {
            providers: { openai: true },
            routers: { stt: { model: 'openai/gpt-4o-mini-transcribe' } },
            transcriptionModel: 'stt',
          },
        }),
      );

      expect(result.ai?.transcriptionModel).toBe('stt');
    });

    it.each(rejections)('rejects $name', ({ ai, transcriptionModel, message }) => {
      const config = makeConfig({ ai: { ...ai, transcriptionModel } as never });

      expect(() => sanitize(config)).toThrow(message);
    });

    it.each(rejections)(
      'warns and keeps $name during codegen',
      ({ ai, transcriptionModel, message }) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const config = makeConfig({ ai: { ...ai, transcriptionModel } as never });

        const result = sanitize(config, { mode: 'codegen' });

        expect(result.ai?.transcriptionModel).toBe(transcriptionModel);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(message);
      },
    );

    it('preserves a model listed in the provider models list', () => {
      const result = sanitize(
        makeConfig({
          ai: {
            providers: { groq: { apiKey: 'k', models: ['whisper-large-v3-turbo'] } },
            transcriptionModel: 'groq/whisper-large-v3-turbo',
          },
        }),
      );

      expect(result.ai?.transcriptionModel).toBe('groq/whisper-large-v3-turbo');
    });

    it('preserves a transcription model of a custom provider', () => {
      const result = sanitize(
        makeConfig({
          ai: {
            providers: {
              internal: {
                type: 'openai-compatible',
                baseUrl: 'https://models.test',
                models: [{ id: 'listen', mode: 'audio_transcription' }],
              },
            },
            transcriptionModel: 'internal/listen',
          },
        } as never),
      );

      expect(result.ai?.transcriptionModel).toBe('internal/listen');
    });

    it('rejects a chat model of a custom provider', () => {
      const config = makeConfig({
        ai: {
          providers: {
            internal: {
              type: 'openai-compatible',
              baseUrl: 'https://models.test',
              models: [{ id: 'talk', mode: 'chat' }],
            },
          },
          transcriptionModel: 'internal/talk',
        },
      } as never);

      expect(() => sanitize(config)).toThrow(
        "[frogbot] ai.transcriptionModel 'internal/talk' is not a transcription model.",
      );
    });

    it('rejects a model left out of the provider models list', () => {
      const config = makeConfig({
        ai: {
          providers: { openai: { apiKey: 'k', models: ['gpt-4o-mini'] } },
          transcriptionModel: 'openai/whisper-1',
        },
      });

      expect(() => sanitize(config)).toThrow(
        "[frogbot] ai.transcriptionModel 'openai/whisper-1' is not configured.",
      );
    });

    it('rejects a model that the catalog does not list', () => {
      const config = makeConfig({
        ai: { providers: { openai: true }, transcriptionModel: 'openai/whisper-2' } as never,
      });

      expect(() => sanitize(config)).toThrow(
        "[frogbot] ai.transcriptionModel 'openai/whisper-2' is not configured.",
      );
    });

    it('does not warn when both model settings are valid in codegen', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const config = makeConfig({
        ai: {
          providers: { openai: true },
          smallModel: 'openai/gpt-5-nano',
          transcriptionModel: 'openai/whisper-1',
        },
      });

      sanitize(config, { mode: 'codegen' });

      expect(warn).not.toHaveBeenCalled();
    });

    it('warns once per invalid setting when both are invalid in codegen', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const config = makeConfig({
        ai: {
          providers: { openai: true },
          smallModel: 'openai/whisper-1',
          transcriptionModel: 'openai/gpt-4o-mini',
        },
      });

      sanitize(config, { mode: 'codegen' });

      expect(warn.mock.calls).toEqual([
        ["[frogbot] ai.smallModel 'openai/whisper-1' is not a chat model."],
        ["[frogbot] ai.transcriptionModel 'openai/gpt-4o-mini' is not a transcription model."],
      ]);
    });

    it('throws without warning in a running app', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const config = makeConfig({
        ai: { providers: { openai: true }, transcriptionModel: 'openai/gpt-4o-mini' },
      });

      expect(() => sanitize(config)).toThrow();
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('ai model settings with multi-segment model IDs', () => {
    it('preserves a chat smallModel whose ID has a nested provider path', () => {
      const result = sanitize(
        makeConfig({
          ai: { providers: { vercel: true }, smallModel: 'vercel/openai/gpt-4o-mini' },
        } as never),
      );

      expect(result.ai?.smallModel).toBe('vercel/openai/gpt-4o-mini');
    });

    it('preserves a transcriptionModel whose ID has a nested provider path', () => {
      const result = sanitize(
        makeConfig({
          ai: {
            providers: { vercel: true },
            transcriptionModel: 'vercel/openai/gpt-4o-mini-transcribe',
          },
        } as never),
      );

      expect(result.ai?.transcriptionModel).toBe('vercel/openai/gpt-4o-mini-transcribe');
    });
  });

  describe('ai.smallModel with custom providers', () => {
    const providers = {
      internal: {
        type: 'openai-compatible',
        baseUrl: 'https://models.test',
        models: [
          { id: 'talk', mode: 'chat' },
          { id: 'listen', mode: 'audio_transcription' },
        ],
      },
    };

    it('preserves a chat model of a custom provider', () => {
      const result = sanitize(
        makeConfig({ ai: { providers, smallModel: 'internal/talk' } } as never),
      );

      expect(result.ai?.smallModel).toBe('internal/talk');
    });

    it('rejects a transcription model of a custom provider', () => {
      const config = makeConfig({ ai: { providers, smallModel: 'internal/listen' } } as never);

      expect(() => sanitize(config)).toThrow(
        "[frogbot] ai.smallModel 'internal/listen' is not a chat model.",
      );
    });

    it('rejects a model the custom provider does not declare', () => {
      const config = makeConfig({ ai: { providers, smallModel: 'internal/other' } } as never);

      expect(() => sanitize(config)).toThrow(
        "[frogbot] ai.smallModel 'internal/other' is not configured.",
      );
    });
  });

  describe('agents', () => {
    const ai = { providers: { openai: { apiKey: 'sk-test' } } };
    const agent = {
      slug: 'support',
      model: 'openai/gpt-5.4-mini',
      instructions: 'Help the user',
    };
    const makeTool = (slug: string, overrides: Record<string, unknown> = {}) => ({
      slug,
      description: `Run ${slug}`,
      inputSchema: {},
      execute: vi.fn(),
      ...overrides,
    });
    const createChannel = definePiece({
      slug: 'channel',
      label: 'Channel',
      auth: z.object({ token: z.string() }),
      client: ({ auth }) => auth,
      actions: [],
      channel: {
        adapter: () => ({}) as never,
        async identity() {
          return null;
        },
      },
    });

    it('normalizes a string model to the default and only option', () => {
      const result = sanitize(makeConfig({ ai, agents: [agent] } as never));

      expect(result.agents?.[0]?.model).toEqual({
        default: 'openai/gpt-5.4-mini',
        options: ['openai/gpt-5.4-mini'],
      });
    });

    it.each([
      { model: agent.model, allowModels: ['openai/gpt-4o'], options: "['openai/gpt-4o']" },
      { model: agent.model, allowModels: [], options: '[]' },
      { model: { default: agent.model, options: '*' }, allowModels: [], options: '[]' },
    ])(
      'rejects removed allowModels with the agent replacement ($options)',
      ({ model, allowModels, options }) => {
        const config = makeConfig({ ai, agents: [{ ...agent, model, allowModels }] } as never);

        expect(() => sanitize(config)).toThrow(
          `[frogbot] Agent 'support' uses \`allowModels\`, which was removed. Use \`model: { default: 'openai/gpt-5.4-mini', options: ${options} }\`.`,
        );
      },
    );

    it('uses ai.defaultModel when the agent model is omitted', () => {
      const result = sanitize(
        makeConfig({
          ai: { ...ai, defaultModel: 'openai/gpt-4o' },
          agents: [{ slug: 'support', instructions: 'Help the user' }],
        } as never),
      );

      expect(result.agents?.[0]?.model).toEqual({
        default: 'openai/gpt-4o',
        options: ['openai/gpt-4o'],
      });
    });

    it.each(['runtime', 'codegen'] as const)(
      'rejects removed allowModels with the AI default in %s mode',
      (mode) => {
        const config = makeConfig({
          ai: { ...ai, defaultModel: agent.model },
          agents: [{ slug: agent.slug, instructions: agent.instructions, allowModels: [] }],
        } as never);

        expect(() => sanitize(config, { mode })).toThrow(
          "[frogbot] Agent 'support' uses `allowModels`, which was removed. Use `model: { default: 'openai/gpt-5.4-mini', options: [] }`.",
        );
      },
    );

    it('puts the explicit default first and deduplicates array options', () => {
      const config = makeConfig({
        ai,
        agents: [
          {
            ...agent,
            model: {
              default: agent.model,
              options: ['openai/gpt-4o', 'openai/gpt-4o-mini', agent.model, 'openai/gpt-4o'],
            },
          },
        ],
      } as never);

      const result = sanitize(config);

      expect(result.agents?.[0]?.model).toEqual({
        default: agent.model,
        options: [agent.model, 'openai/gpt-4o', 'openai/gpt-4o-mini'],
      });
    });

    it('uses ai.defaultModel for an object without a default', () => {
      const config = makeConfig({
        ai: { ...ai, defaultModel: agent.model },
        agents: [{ ...agent, model: { options: ['openai/gpt-4o'] } }],
      } as never);

      const result = sanitize(config);

      expect(result.agents?.[0]?.model).toEqual({
        default: agent.model,
        options: [agent.model, 'openai/gpt-4o'],
      });
    });

    it('does not choose the first option when no default is configured', () => {
      const config = makeConfig({
        ai,
        agents: [{ ...agent, model: { options: ['openai/gpt-4o'] } }],
      } as never);

      expect(() => sanitize(config)).toThrow(
        "[frogbot] Agent 'support' requires a `model` or `ai.defaultModel`.",
      );
    });

    it('accepts an empty options array as the default only', () => {
      const config = makeConfig({
        ai,
        agents: [{ ...agent, model: { default: agent.model, options: [] } }],
      } as never);

      const result = sanitize(config);

      expect(result.agents?.[0]?.model.options).toEqual([agent.model]);
    });

    it.each(['all', {}, undefined])('rejects invalid model options %j', (options) => {
      const config = makeConfig({
        ai,
        agents: [{ ...agent, model: { default: agent.model, options } }],
      } as never);

      expect(() => sanitize(config)).toThrow(
        "[frogbot] Agent 'support' model.options must be `'*'` or an array.",
      );
    });

    it('expands wildcard options to only the configured Bedrock chat allowlist', () => {
      const defaultModel = 'bedrock/zai.glm-4.7-flash';

      const config = makeConfig({
        ai: {
          providers: {
            bedrock: {
              region: 'us-east-1',
              models: ['zai.glm-4.7-flash', 'amazon.nova-lite-v1:0'],
            },
            openai: undefined,
          },
        },
        agents: [{ ...agent, model: { default: defaultModel, options: '*' } }],
      } as never);

      const result = sanitize(config);

      expect(result.agents?.[0]?.model.options).toEqual([
        defaultModel,
        'bedrock/amazon.nova-lite-v1:0',
      ]);
    });

    it('expands a key-only OpenRouter provider to its whole chat catalog', () => {
      const chatIds = catalog
        .filter(({ provider, mode }) => provider === 'openrouter' && mode === 'chat')
        .map(({ id }) => id)
        .sort();

      const config = makeConfig({
        ai: { providers: { openrouter: { apiKey: 'test' } } },
        agents: [{ ...agent, model: { default: chatIds[0], options: '*' } }],
      } as never);

      const result = sanitize(config);

      expect(result.agents?.[0]?.model.options).toEqual(chatIds);
      expect(chatIds.length).toBeGreaterThan(300);
    });

    it('filters custom non-chat models and routers but keeps chat aliases distinct', () => {
      const config = makeConfig({
        ai: {
          providers: {
            internal: {
              type: 'openai-compatible',
              baseUrl: 'https://models.test',
              models: [
                { id: 'chat', mode: 'chat' },
                { id: 'embed', mode: 'embedding' },
                { id: 'image', mode: 'image_generation' },
              ],
            },
          },
          routers: {
            fast: { model: 'internal/chat' },
            embeddings: { model: 'internal/embed' },
            unknown: { model: 'internal/missing' },
          },
        },
        agents: [{ ...agent, model: { default: 'internal/chat', options: '*' } }],
      });

      const result = sanitize(config);

      expect(result.agents?.[0]?.model.options).toEqual(['internal/chat', 'fast']);
    });

    it('keeps a built-in router and its target as distinct wildcard choices', () => {
      const config = makeConfig({
        ai: {
          providers: { openai: { apiKey: 'test', models: ['gpt-5.4-mini'] } },
          routers: { fast: { model: agent.model } },
        },
        agents: [{ ...agent, model: { default: 'fast', options: '*' } }],
      });

      const result = sanitize(config);

      expect(result.agents?.[0]?.model).toEqual({
        default: 'fast',
        options: ['fast', agent.model],
      });
    });

    it('deduplicates array IDs without merging a router with its target', () => {
      const config = makeConfig({
        ai: { ...ai, routers: { fast: { model: agent.model } } },
        agents: [
          {
            ...agent,
            model: {
              default: agent.model,
              options: ['fast', agent.model, 'fast', 'openai/gpt-4o'],
            },
          },
        ],
      });

      const result = sanitize(config);

      expect(result.agents?.[0]?.model.options).toEqual([agent.model, 'fast', 'openai/gpt-4o']);
    });

    it('expands wildcard options to the exact union of configured provider chat catalogs', () => {
      const chatIds = catalog
        .filter(({ provider, mode }) => ['google', 'vercel'].includes(provider) && mode === 'chat')
        .map(({ id }) => id)
        .sort();

      const config = makeConfig({
        ai: {
          providers: {
            google: true,
            vercel: { apiKey: 'test' },
            openai: { apiKey: 'test', models: [] },
            anthropic: undefined,
          },
          defaultModel: 'google/gemini-3.5-flash',
        },
        agents: [general()],
      });

      const result = sanitize(config);

      expect(result.agents?.[0]?.model.options).toEqual([
        'google/gemini-3.5-flash',
        ...chatIds.filter((id) => id !== 'google/gemini-3.5-flash'),
      ]);
    });

    it('filters non-chat entries from a built-in provider model list', () => {
      const config = makeConfig({
        ai: {
          providers: {
            openai: {
              apiKey: 'test',
              models: ['gpt-5.4-mini', 'text-embedding-3-small', 'gpt-image-1.5'],
            },
          },
        },
        agents: [{ ...agent, model: { default: agent.model, options: '*' } }],
      });

      const result = sanitize(config);

      expect(result.agents?.[0]?.model.options).toEqual([agent.model]);
    });

    it('keeps non-chat models and unknown routers in policy field choices', async () => {
      const config = makeConfig({
        ai: {
          providers: {
            openai: { apiKey: 'test', models: ['gpt-5.4-mini', 'text-embedding-3-small'] },
          },
          routers: {
            fast: { model: agent.model },
            unknown: { model: 'openai/missing' },
          },
        },
        agents: [{ ...agent, model: { default: agent.model, options: '*' } }],
      });

      const result = sanitize(config);
      const payloadConfig = await result._internal.payloadConfig;
      const users = payloadConfig.collections?.find(({ slug }) => slug === 'users');

      expect(users?.fields).toContainEqual(
        expect.objectContaining({
          name: 'models',
          options: ['fast', agent.model, 'openai/text-embedding-3-small', 'unknown'],
        }),
      );
    });

    it.each([
      'embedding',
      'image_generation',
      'audio_speech',
      'audio_transcription',
      'rerank',
      'evaluate',
      'video_generation',
    ] as const)('excludes custom %s models and their routers from wildcard options', (mode) => {
      const config = makeConfig({
        ai: {
          providers: {
            internal: {
              type: 'openai-compatible',
              baseUrl: 'https://models.test',
              models: [
                { id: 'chat', mode: 'chat' },
                { id: 'other', mode },
              ],
            },
          },
          routers: { other: { model: 'internal/other' } },
        },
        agents: [{ ...agent, model: { default: 'internal/chat', options: '*' } }],
      });

      const result = sanitize(config);

      expect(result.agents?.[0]?.model.options).toEqual(['internal/chat']);
    });

    it('rejects a non-chat AI default inherited by the general preset', () => {
      const config = makeConfig({
        ai: { ...ai, defaultModel: 'openai/text-embedding-3-small' },
        agents: [general()],
      });

      expect(() => sanitize(config, { mode: 'runtime' })).toThrow(
        "[frogbot] Agent 'general' model.default 'openai/text-embedding-3-small' is not chat-capable.",
      );
    });

    it('prefers the explicit agent default over the AI default', () => {
      const config = makeConfig({
        ai: { ...ai, defaultModel: 'openai/gpt-4o' },
        agents: [{ ...agent, model: { default: agent.model, options: [] } }],
      });

      const result = sanitize(config);

      expect(result.agents?.[0]?.model).toEqual({ default: agent.model, options: [agent.model] });
    });

    describe('wildcard model validation during codegen', () => {
      afterEach(() => {
        vi.restoreAllMocks();
      });

      it.each([
        ['openai/unknown', 'not configured'],
        ['openai/text-embedding-3-small', 'not chat-capable'],
      ] as const)('warns and preserves the inherited %s default', (defaultModel, reason) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const chatIds = catalog
          .filter(({ provider, mode }) => provider === 'openai' && mode === 'chat')
          .map(({ id }) => id)
          .sort();

        const config = makeConfig({
          ai: { ...ai, defaultModel },
          agents: [general()],
        });

        const result = sanitize(config, { mode: 'codegen' });

        expect(result.agents?.[0]?.model).toEqual({
          default: defaultModel,
          options: [defaultModel, ...chatIds],
        });
        expect(warn).toHaveBeenCalledWith(
          `[frogbot] Agent 'general' model.default '${defaultModel}' is ${reason}.`,
        );
      });

      it('rejects malformed wildcard alternatives during codegen', () => {
        const config = makeConfig({
          ai,
          agents: [{ ...agent, model: { default: agent.model, options: 'all' } }],
        } as never);

        expect(() => sanitize(config, { mode: 'codegen' })).toThrow(
          "[frogbot] Agent 'support' model.options must be `'*'` or an array.",
        );
      });
    });

    it('rejects an explicit router whose target is not chat-capable', () => {
      const config = makeConfig({
        ai: { ...ai, routers: { embeddings: { model: 'openai/text-embedding-3-small' } } },
        agents: [{ ...agent, model: { default: agent.model, options: ['embeddings'] } }],
      });

      expect(() => sanitize(config)).toThrow(
        "[frogbot] Agent 'support' model.options 'embeddings' is not chat-capable.",
      );
    });

    it.each(['', 42, null])('rejects invalid explicit model IDs %j', (model) => {
      const config = makeConfig({
        ai,
        agents: [{ ...agent, model: { default: agent.model, options: [model] } }],
      } as never);

      expect(() => sanitize(config)).toThrow(
        "[frogbot] Agent 'support' model.options must contain model IDs.",
      );
    });

    it.each([
      { model: 'openai/text-embedding-3-small', field: 'model' },
      { model: { default: 'openai/text-embedding-3-small', options: '*' }, field: 'model.default' },
      {
        model: { default: agent.model, options: ['openai/text-embedding-3-small'] },
        field: 'model.options',
      },
    ])('rejects a non-chat model in $field', ({ model, field }) => {
      const config = makeConfig({ ai, agents: [{ ...agent, model }] } as never);

      expect(() => sanitize(config)).toThrow(
        `[frogbot] Agent 'support' ${field} 'openai/text-embedding-3-small' is not chat-capable.`,
      );
    });

    it.each([
      { model: 'openai/unknown', field: 'model', id: 'openai/unknown' },
      {
        model: { default: 'openai/unknown', options: '*' },
        field: 'model.default',
        id: 'openai/unknown',
      },
      {
        model: { default: agent.model, options: ['openai/unknown'] },
        field: 'model.options',
        id: 'openai/unknown',
      },
      {
        model: { default: agent.model, options: ['anthropic/claude-sonnet-4-6'] },
        field: 'model.options',
        id: 'anthropic/claude-sonnet-4-6',
      },
    ])('rejects an unconfigured model in $field ($id)', ({ model, field, id }) => {
      const config = makeConfig({ ai, agents: [{ ...agent, model }] } as never);

      expect(() => sanitize(config)).toThrow(
        `[frogbot] Agent 'support' ${field} '${id}' is not configured.`,
      );
    });

    it.each([
      { model: 'openai/gpt-4o', field: 'model' },
      { model: { default: 'openai/gpt-4o', options: '*' }, field: 'model.default' },
      { model: { default: agent.model, options: ['openai/gpt-4o'] }, field: 'model.options' },
    ])('rejects a catalog model outside the provider list in $field', ({ model, field }) => {
      const config = makeConfig({
        ai: { providers: { openai: { apiKey: 'test', models: ['gpt-5.4-mini'] } } },
        agents: [{ ...agent, model }],
      } as never);

      expect(() => sanitize(config)).toThrow(
        `[frogbot] Agent 'support' ${field} 'openai/gpt-4o' is not configured.`,
      );
    });

    it('warns about unknown and non-chat explicit models during codegen', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const config = makeConfig({
        ai,
        agents: [
          {
            ...agent,
            model: { default: 'openai/unknown', options: ['openai/text-embedding-3-small'] },
          },
        ],
      } as never);

      const result = sanitize(config, { mode: 'codegen' });

      expect(result.agents?.[0]?.model.options).toEqual([
        'openai/unknown',
        'openai/text-embedding-3-small',
      ]);
      expect(warn).toHaveBeenCalledWith(
        "[frogbot] Agent 'support' model.default 'openai/unknown' is not configured.",
      );
      expect(warn).toHaveBeenCalledWith(
        "[frogbot] Agent 'support' model.options 'openai/text-embedding-3-small' is not chat-capable.",
      );

      warn.mockRestore();
    });

    it('starts the Google general preset with Gemini chat models and no embeddings', () => {
      const config = makeConfig({
        ai: { providers: { google: true }, defaultModel: 'google/gemini-3.5-flash' },
        agents: [general()],
      });

      const result = sanitize(config);

      expect(result.agents?.[0]?.model.default).toBe('google/gemini-3.5-flash');
      expect(result.agents?.[0]?.model.options).toContain('google/gemini-2.5-pro');
      expect(result.agents?.[0]?.model.options).not.toContain('google/gemini-embedding-001');
      expect(result.agents?.[0]?.model.options).not.toContain('google/gemini-embedding-2');
      expect(result.agents?.[0]?.model.options).not.toContain('google/gemini-3.5-transcribe');
    });

    it('narrows the general preset to an overridden string model', () => {
      const config = makeConfig({ ai, agents: [general({ model: 'openai/gpt-5.4-mini' })] });

      const result = sanitize(config);

      expect(result.agents?.[0]?.model).toEqual({ default: agent.model, options: [agent.model] });
    });

    it('sanitizes and registers the general preset using ai.defaultModel', async () => {
      const result = sanitize(
        makeConfig({
          ai: { ...ai, defaultModel: 'openai/gpt-4o' },
          agents: [general()],
        } as never),
      );

      const payloadConfig = await result._internal.payloadConfig;

      expect(result.agents?.[0]).toMatchObject({
        slug: 'general',
        model: { default: 'openai/gpt-4o' },
      });
      expect(result.agents?.[0]?.model.options).toEqual([
        'openai/gpt-4o',
        ...catalog
          .filter(
            ({ provider, mode, id }) =>
              provider === 'openai' && mode === 'chat' && id !== 'openai/gpt-4o',
          )
          .map(({ id }) => id)
          .sort(),
      ]);
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

    it('rejects a channel without the channel capability', () => {
      const plain = definePiece({ slug: 'plain', label: 'Plain', actions: [] })();

      expect(() =>
        sanitize(
          makeConfig({ ai, agents: [{ ...agent, channels: [plain] }] } as unknown as FrogBotConfig),
        ),
      ).toThrow("Every channel in agent 'support' must be a channel-capable piece instance");
    });

    it('rejects a channel without factory auth', () => {
      const channel = createChannel({} as never);

      expect(() =>
        sanitize(makeConfig({ ai, agents: [{ ...agent, channels: [channel] }] } as never)),
      ).toThrow("Channel 'channel' in agent 'support' requires factory auth");
    });

    it('rejects one channel instance mounted by two agents', () => {
      const channel = createChannel({ auth: { token: 'secret' } });

      expect(() =>
        sanitize(
          makeConfig({
            ai,
            agents: [
              { ...agent, channels: [channel] },
              { ...agent, slug: 'sales', channels: [channel] },
            ],
          } as never),
        ),
      ).toThrow("Channel 'channel' is mounted by agents 'support' and 'sales'");
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

    it('expands native piece actions and instances before tool validation', () => {
      const createExample = definePiece({
        slug: 'example',
        label: 'Example',
        actions: [
          { slug: 'first', description: 'First', input: z.object({}), async run() {} },
          { slug: 'second', description: 'Second', input: z.object({}), async run() {} },
        ],
      });
      const example = createExample({});
      const action = sanitize(
        makeConfig({ ai, agents: [{ ...agent, tools: [example.first] }] } as never),
      );
      expect(action.agents?.[0].tools?.map(({ slug }) => slug)).toEqual(['example_first']);
      const whole = sanitize(makeConfig({ ai, agents: [{ ...agent, tools: [example] }] } as never));
      expect(whole.agents?.[0].tools?.map(({ slug }) => slug)).toEqual([
        'example_first',
        'example_second',
      ]);
    });

    it('installs the trigger host from agent mounts without root piece registration', async () => {
      const createExample = definePiece({
        slug: 'trigger-example',
        label: 'Trigger example',
        actions: [],
        webhook: {
          verify: async () => true,
          parse: () => ({ event: 'created' }),
        },
        triggers: [
          {
            slug: 'created',
            type: 'app',
            event: 'created',
            description: 'Created',
            input: z.object({}),
            async run() {
              return [];
            },
          },
        ],
      });
      const example = createExample({});
      const trigger = {
        trigger: example.triggers.created,
        handler: vi.fn(),
      };
      const result = sanitize(
        makeConfig({ ai, agents: [{ ...agent, triggers: [trigger] }] } as never),
      );
      expect(result.agents?.[0].triggers).toEqual([trigger]);
      expect(result._internal.triggers[example.slug].instance).toBe(example);
      expect(result.pieces.instances).toContain(example);
      await expect(result._internal.payloadConfig).resolves.toMatchObject({
        jobs: {
          tasks: expect.arrayContaining([
            expect.objectContaining({ slug: 'frogbot-run-agent-trigger' }),
          ]),
          autoRun: expect.arrayContaining([expect.objectContaining({ allQueues: true })]),
        },
        endpoints: expect.arrayContaining([
          expect.objectContaining({ path: '/webhooks/:instance' }),
        ]),
      });
      const removed = sanitize(makeConfig({ ai, agents: [{ ...agent, tools: [example] }] }));
      expect(Object.keys(removed._internal.triggers)).toEqual([]);
      expect(removed.pieces.instances).toContain(example);
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
      expect(
        (payloadConfig as any).endpoints.map(
          (endpoint: any) => `${endpoint.method} ${endpoint.path}`,
        ),
      ).toEqual([
        'get /jobs/:token/resume',
        'head /jobs/:token/resume',
        'post /jobs/:token/resume',
        'get /frogbot',
        'post /agents/:slug',
        'get /agents/:slug/chats/:chatId/pending',
        'post /agents/:slug/chats/:chatId/settle',
        'patch /agents/:slug/chats/:chatId/messages/:messageId',
        'delete /agents/:slug/chats/:chatId/messages/:messageId',
        'get /agents/:slug/authorizations',
        'get /agents',
        'post /frogbot/chat/branch',
        'post /frogbot/chat/suggest-title',
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
      ).toEqual(['/jobs/:token/resume', '/jobs/:token/resume', '/jobs/:token/resume', '/frogbot']);
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
        ).toEqual([
          '/jobs/:token/resume',
          '/jobs/:token/resume',
          '/jobs/:token/resume',
          ...expected,
        ]);
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
        'frogbot-sweep-jobs',
        'frogbot-run-agent-schedule',
        'frogbot-cleanup-kv',
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
      ).toThrow("[frogbot] Agent 'support' model 'openai/gpt-5.4-mini' is not configured.");
    });

    it('rejects model mismatches at runtime', () => {
      expect(() =>
        sanitize(
          makeConfig({
            ai: { providers: { anthropic: true } },
            agents: [agent],
          }),
        ),
      ).toThrow("[frogbot] Agent 'support' model 'openai/gpt-5.4-mini' is not configured.");
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
        "[frogbot] Agent 'support' model 'openai/gpt-5.4-mini' is not configured.",
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

    it.each(['connections', 'jobs', 'webhooks'])('reserves future %s API paths', (prefix) => {
      expect(() =>
        sanitize(
          makeConfig({
            endpoints: [
              { path: `/${prefix}/custom`, method: 'get', handler: () => new Response() },
            ],
          }),
        ),
      ).toThrow(`Endpoint path '/${prefix}/custom' is reserved`);
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
    const agents = [
      { slug: 'support', model: 'openai/gpt-5.4-mini', instructions: 'Help the user' },
    ];

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
        assetsSlug: 'frogbot-chat-assets',
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
        assetsSlug: 'frogbot-chat-assets',
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
        'frogbot-chat-assets',
        'frogbot-chat-turns',
        'usage-logs',
        'frogbot-trigger-subscriptions',
        'frogbot-waitpoints',
        'files',
      ]);
      const payloadConfig = await result._internal.payloadConfig;
      const payloadSlugs = (payloadConfig as any).collections.map((c: any) => c.slug);
      expect(payloadSlugs).toEqual([
        'users',
        'chats',
        'messages',
        'frogbot-chat-assets',
        'frogbot-chat-turns',
        'usage-logs',
        'frogbot-trigger-subscriptions',
        'frogbot-waitpoints',
        'files',
      ]);
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
    function aiConfig(overrides?: Partial<FrogBotConfig['ai']>) {
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
