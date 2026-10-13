import type * as frogbotModule from 'frogbot';
import type { FrogBotSanitizedConfig } from 'frogbot';
import type * as frogbotInternalModule from 'frogbot/internal';
import type * as payloadModule from 'payload';
import { type ComponentProps, createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const frogbot = { attached: true };
  const i18n = { language: 'en', t: (key: string) => key };

  return {
    attachRegisteredFrogBot: vi.fn((req: Record<string, unknown>) =>
      Object.assign(req, { frogbot }),
    ),
    createLocalReq: vi.fn((options: { req?: Record<string, unknown> }) =>
      Promise.resolve({ ...options.req }),
    ),
    executeAuthStrategies: vi.fn(() => Promise.resolve({ user: { id: 'user-1' } })),
    frogbot,
    getCachedFrogBot: vi.fn(() => ({
      config: {
        agents: [{ slug: 'general' }],
        chat: {
          enabled: true,
          chatsSlug: 'conversations',
          messagesSlug: 'turns',
          assetsSlug: 'frogbot-chat-assets',
        },
      },
    })),
    getNextRequestI18n: vi.fn(() => Promise.resolve(i18n)),
    getPayload: vi.fn(() => Promise.resolve({})),
    headers: vi.fn(() => Promise.resolve(new Headers({ host: 'admin.test' }))),
    i18n,
    RootPage: vi.fn(() => null),
    NotFoundPage: vi.fn(() => null),
    generatePageMetadata: vi.fn((args: unknown) => Promise.resolve(args)),
    RenderServerComponent: vi.fn(
      (_props: { Component?: unknown }): ReactNode => 'rendered-setting',
    ),
    redirect: vi.fn(),
    ListControls: vi.fn(() => null),
    ListHeader: vi.fn(() => null),
    ListQueryProvider: vi.fn(({ children }) => children),
    listGroupBy: undefined as boolean | undefined,
    ViewControls: vi.fn(() => null),
  };
});

vi.mock('@payloadcms/next/views', () => mocks);

vi.mock('@payloadcms/ui/elements/RenderServerComponent', () => ({
  RenderServerComponent: mocks.RenderServerComponent,
}));

vi.mock('@payloadcms/ui', () => ({
  Button: () => null,
  Card: ({ buttonAriaLabel, href, id, title }: Record<string, string>) =>
    createElement('a', { 'aria-label': buttonAriaLabel, href, id }, title),
  Gutter: ({ children }: ComponentProps<'div'>) => createElement('div', null, children),
  Link: ({ children, href, ...props }: ComponentProps<'a'>) =>
    createElement('a', { href, ...props }, children),
  ListSelection: () => null,
  ListControls: mocks.ListControls,
  ListHeader: mocks.ListHeader,
  ListQueryProvider: mocks.ListQueryProvider,
  PageControls: () => null,
  RelationshipProvider: ({ children }: ComponentProps<'div'>) => children,
  RenderCustomComponent: () => null,
  SelectionProvider: ({ children }: ComponentProps<'div'>) => children,
  SelectMany: () => null,
  StickyToolbar: ({ children }: ComponentProps<'div'>) => children,
  TableColumnsProvider: ({ children }: ComponentProps<'div'>) => children,
  useAuth: () => ({}),
  useBulkUpload: () => ({
    drawerSlug: 'bulk-upload',
    setCollectionSlug: vi.fn(),
    setOnSuccess: vi.fn(),
  }),
  useConfig: () => ({
    config: { routes: { admin: '/admin' }, serverURL: '' },
    getEntityConfig: () => ({
      admin: { custom: { frogbot: { views: [{ groupBy: mocks.listGroupBy, type: 'list' }] } } },
      fields: [],
      labels: { plural: 'Posts', singular: 'Post' },
      slug: 'posts',
    }),
  }),
  useControllableState: (value: unknown) => [value],
  useListDrawerContext: () => ({}),
  useListQuery: () => ({ data: { docs: [], totalDocs: 0 } }),
  useModal: () => ({ openModal: vi.fn() }),
  useStepNav: () => ({ setStepNav: vi.fn() }),
  useTranslation: () => ({ i18n: { t: (key: string) => key } }),
  useWindowInfo: () => ({ breakpoints: { s: false } }),
  ViewDescription: () => null,
  withCondition: <T>(Component: T) => Component,
}));

vi.mock('@payloadcms/ui/elements/ColumnSelector', () => ({}));
vi.mock('@payloadcms/ui/elements/GroupByBuilder', () => ({}));
vi.mock('@payloadcms/ui/elements/NoListResults', () => ({ NoListResults: () => null }));
vi.mock('@payloadcms/ui/elements/QueryPresets/QueryPresetBar', () => ({}));
vi.mock('@payloadcms/ui/elements/SearchBar', () => ({}));
vi.mock('@payloadcms/ui/elements/WhereBuilder', () => ({}));
vi.mock('@payloadcms/ui/icons/Dots', () => ({}));

vi.mock('@payloadcms/ui/rsc', () => ({
  getColumns: vi.fn(() => []),
  renderTable: vi.fn(() => ({ columnState: [], Table: null })),
}));

vi.mock('@payloadcms/ui/utilities/reduceFieldsToOptions', () => ({}));

vi.mock('@frogbotai/ui/admin/rsc', async () => ({
  ...(await import('../../../../packages/ui/src/admin/adapters/server.js')),
  ...(await import('../../../../packages/ui/src/admin/views/Settings/resolveSection.js')),
}));

vi.mock('../../../../packages/ui/src/admin/views/controls/ViewControls.client.js', () => ({
  ViewControls: mocks.ViewControls,
}));

vi.mock('../../../../packages/ui/src/admin/elements/Nav/index.js', () => ({
  FrogBotNav: () => null,
}));

vi.mock('frogbot', async (importOriginal) => ({
  ...(await importOriginal<typeof frogbotModule>()),
  getCachedFrogBot: mocks.getCachedFrogBot,
  messagesToUIMessages: (messages: Array<Record<string, unknown>>) =>
    messages.map(({ id, role, parts, metadata }) => ({
      id: String(id),
      role,
      parts,
      ...(metadata == null ? {} : { metadata }),
    })),
}));

vi.mock('frogbot/internal', async (importOriginal) => ({
  ...(await importOriginal<typeof frogbotInternalModule>()),
  attachRegisteredFrogBot: mocks.attachRegisteredFrogBot,
}));

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof payloadModule>()),
  createLocalReq: mocks.createLocalReq,
  executeAuthStrategies: mocks.executeAuthStrategies,
  getPayload: mocks.getPayload,
}));

vi.mock('@payloadcms/next/utilities', () => ({ getNextRequestI18n: mocks.getNextRequestI18n }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));

const { RootPage, NotFoundPage, generatePageMetadata } =
  await import('../../../../packages/next/src/exports/views.js');

const { SettingsView } = await import('../../../../packages/ui/src/admin/views/Settings/index.js');

const { getSettingsTitle } =
  await import('../../../../packages/next/src/views/Settings/metadata.js');

function makeConfig(admin?: Record<string, unknown>) {
  const payloadConfig = { admin, collections: [] };
  const config = {
    _internal: { payloadConfig: Promise.resolve(payloadConfig) },
  } as unknown as FrogBotSanitizedConfig;

  return { config, payloadConfig };
}

const params = Promise.resolve({ segments: [] });
const searchParams = Promise.resolve({});

describe('@frogbotai/next views', () => {
  it('RootPage forwards props with the unwrapped payload config promise', async () => {
    const { config, payloadConfig } = makeConfig();

    const element = RootPage({ config, importMap: {}, params, searchParams });

    expect(element.type).toBe(mocks.RootPage);
    expect(element.props.params).toBe(params);
    await expect(element.props.config).resolves.toBe(payloadConfig);
  });

  it('NotFoundPage forwards props with the unwrapped payload config promise', async () => {
    const { config, payloadConfig } = makeConfig();

    const element = NotFoundPage({ config, importMap: {}, params, searchParams });

    expect(element.type).toBe(mocks.NotFoundPage);
    await expect(element.props.config).resolves.toBe(payloadConfig);
  });

  it('generatePageMetadata forwards args with the unwrapped payload config promise', async () => {
    const { config, payloadConfig } = makeConfig();

    await generatePageMetadata({ config, params, searchParams });

    const forwarded = mocks.generatePageMetadata.mock.calls[0][0] as { config: Promise<unknown> };

    await expect(forwarded.config).resolves.toBe(payloadConfig);
  });

  it('generatePageMetadata injects the FrogBot favicon when admin.meta.icons is unset', async () => {
    const { config } = makeConfig({ meta: {} });

    const metadata = (await generatePageMetadata({ config, params, searchParams })) as {
      icons: Array<{ rel: string; type: string; url: string }>;
    };

    expect(metadata.icons).toHaveLength(1);
    expect(metadata.icons[0]).toMatchObject({ rel: 'icon', type: 'image/png' });
    expect(metadata.icons[0].url).toBeTruthy();
  });

  it('generatePageMetadata keeps user icons when admin.meta.icons is set', async () => {
    const icons = [{ rel: 'icon', url: '/my-favicon.png' }];
    const { config } = makeConfig({ meta: { icons } });

    const metadata = (await generatePageMetadata({ config, params, searchParams })) as {
      icons?: unknown;
    };

    expect(metadata.icons).toBeUndefined();
  });

  it('generatePageMetadata injects the FrogBot OG image for static mode without user images', async () => {
    const { config } = makeConfig({ meta: { defaultOGImageType: 'static' } });

    const metadata = (await generatePageMetadata({ config, params, searchParams })) as {
      openGraph: { images: Array<{ url: string; width: number; height: number }> };
    };

    expect(metadata.openGraph.images).toHaveLength(1);
    expect(metadata.openGraph.images[0]).toMatchObject({ width: 1200, height: 630 });
    expect(metadata.openGraph.images[0].url).toBeTruthy();
  });

  it('generatePageMetadata leaves openGraph alone when user images or non-static mode are set', async () => {
    const withImages = makeConfig({
      meta: { defaultOGImageType: 'static', openGraph: { images: [{ url: '/og.png' }] } },
    });

    const dynamicMode = makeConfig({ meta: { defaultOGImageType: 'dynamic' } });

    const a = (await generatePageMetadata({ config: withImages.config, params, searchParams })) as {
      openGraph?: unknown;
    };

    const b = (await generatePageMetadata({
      config: dynamicMode.config,
      params,
      searchParams,
    })) as {
      openGraph?: unknown;
    };

    expect(a.openGraph).toBeUndefined();
    expect(b.openGraph).toBeUndefined();
  });

  describe('Settings titles', () => {
    const settingsView = {
      Component: '@frogbotai/ui/admin/rsc#SettingsView',
      exact: false,
      path: '/settings',
    };

    const payloadMetadata = {
      description: 'Upstream',
      keywords: 'Upstream',
      openGraph: { title: 'Upstream' },
      title: 'Upstream - FrogBot',
    };

    type SettingsMetadata = {
      description?: unknown;
      icons?: unknown[];
      keywords?: unknown;
      openGraph?: { images?: unknown[]; title?: unknown };
      title?: unknown;
    };

    function makeSettingsConfig({
      meta = { titleSuffix: '- FrogBot' },
      settings = [],
      views = { settings: settingsView },
    }: {
      meta?: Record<string, unknown>;
      settings?: Array<Record<string, unknown>>;
      views?: Record<string, unknown>;
    } = {}) {
      return {
        admin: { components: { views }, meta, routes: { account: '/account' }, settings },
        collections: [],
        routes: { admin: '/admin' },
      };
    }

    async function readMetadata(
      payloadConfig: ReturnType<typeof makeSettingsConfig>,
      segments: string[],
    ) {
      const config = {
        _internal: { payloadConfig: Promise.resolve(payloadConfig) },
      } as unknown as FrogBotSanitizedConfig;

      return (await generatePageMetadata({
        config,
        params: Promise.resolve({ segments }),
        searchParams,
      })) as SettingsMetadata;
    }

    beforeEach(() => {
      mocks.executeAuthStrategies.mockClear();

      mocks.generatePageMetadata.mockImplementation(() =>
        Promise.resolve(structuredClone(payloadMetadata)),
      );
    });

    afterEach(() => {
      mocks.generatePageMetadata.mockImplementation((args: unknown) => Promise.resolve(args));
    });

    it('generatePageMetadata titles /settings/collections as Collections', async () => {
      const metadata = await readMetadata(makeSettingsConfig(), ['settings', 'collections']);

      expect(metadata).toMatchObject({
        description: 'Collections',
        keywords: 'Collections',
        openGraph: { title: 'Collections' },
        title: 'Collections - FrogBot',
      });
    });

    it('generatePageMetadata titles a Settings entry with its label', async () => {
      const config = makeSettingsConfig({
        settings: [{ Component: 'Billing', label: 'Billing', path: 'billing' }],
      });

      const metadata = await readMetadata(config, ['settings', 'billing']);

      expect(metadata).toMatchObject({
        description: 'Billing',
        keywords: 'Billing',
        openGraph: { title: 'Billing' },
        title: 'Billing - FrogBot',
      });
    });

    it('generatePageMetadata titles a nested route with the longest matching entry', async () => {
      const config = makeSettingsConfig({
        settings: [
          { Component: 'Billing', label: 'Billing', path: 'billing' },
          { Component: 'Invoices', label: 'Invoices', path: 'billing/invoices' },
        ],
      });

      const metadata = await readMetadata(config, ['settings', 'billing', 'invoices', 'inv-1']);

      expect(metadata.title).toBe('Invoices - FrogBot');
    });

    it('generatePageMetadata does not match an entry by a shared name prefix', async () => {
      const config = makeSettingsConfig({
        settings: [{ Component: 'Billing', label: 'Billing', path: 'billing' }],
      });

      const metadata = await readMetadata(config, ['settings', 'billing-old']);

      expect(metadata.title).toBe('Settings - FrogBot');
    });

    it('generatePageMetadata titles an unknown Settings path as Settings', async () => {
      const metadata = await readMetadata(makeSettingsConfig(), ['settings', 'does-not-exist']);

      expect(metadata).toMatchObject({
        description: 'Settings',
        keywords: 'Settings',
        openGraph: { title: 'Settings' },
        title: 'Settings - FrogBot',
      });
    });

    it('generatePageMetadata never reveals the label of an entry denied by access', async () => {
      const config = makeSettingsConfig({
        settings: [{ access: () => false, Component: 'Vault', label: 'Vault', path: 'vault' }],
      });

      const metadata = await readMetadata(config, ['settings', 'vault']);

      expect(metadata.title).toBe('Settings - FrogBot');
      expect(JSON.stringify(metadata)).not.toContain('Vault');
    });

    it('generatePageMetadata titles a default-access entry as Settings without a user', async () => {
      mocks.executeAuthStrategies.mockResolvedValueOnce({ user: null } as never);

      const config = makeSettingsConfig({
        settings: [{ Component: 'Usage', label: 'Usage', path: 'usage' }],
      });

      const metadata = await readMetadata(config, ['settings', 'usage']);

      expect(metadata.title).toBe('Settings - FrogBot');
      expect(JSON.stringify(metadata)).not.toContain('Usage');
    });

    it('generatePageMetadata awaits an async access with a FrogBot request', async () => {
      const access = vi.fn(() => Promise.resolve(false));

      const config = makeSettingsConfig({
        settings: [{ access, Component: 'Vault', label: 'Vault', path: 'vault' }],
      });

      const metadata = await readMetadata(config, ['settings', 'vault']);

      expect(metadata.title).toBe('Settings - FrogBot');
      expect(access).toHaveBeenCalledWith({
        req: expect.objectContaining({
          frogbot: mocks.frogbot,
          i18n: mocks.i18n,
          user: { id: 'user-1' },
        }),
      });
    });

    it('generatePageMetadata uses the bare section text with an empty titleSuffix', async () => {
      const config = makeSettingsConfig({ meta: { titleSuffix: '' } });

      const metadata = await readMetadata(config, ['settings', 'collections']);

      expect(metadata.title).toBe('Collections');
    });

    it('generatePageMetadata appends a custom titleSuffix to the Settings title', async () => {
      const config = makeSettingsConfig({ meta: { titleSuffix: '- Field Lab' } });

      const metadata = await readMetadata(config, ['settings', 'collections']);

      expect(metadata).toMatchObject({
        openGraph: { title: 'Collections' },
        title: 'Collections - Field Lab',
      });
    });

    it("generatePageMetadata leaves an app's own Settings view metadata untouched", async () => {
      const config = makeSettingsConfig({
        views: { settings: { Component: '/components/MySettings#MySettings', path: '/settings' } },
      });

      const metadata = await readMetadata(config, ['settings', 'collections']);

      expect(metadata).toMatchObject(payloadMetadata);
      expect(mocks.executeAuthStrategies).not.toHaveBeenCalled();
    });

    it('generatePageMetadata gives an app view under /settings the Settings title', async () => {
      const config = makeSettingsConfig({
        views: {
          settings: settingsView,
          reports: { Component: '/components/Reports#Reports', path: '/settings/reports' },
        },
      });

      const metadata = await readMetadata(config, ['settings', 'reports']);

      expect(metadata.title).toBe('Settings - FrogBot');
    });

    it('generatePageMetadata leaves routes outside Settings untouched', async () => {
      const metadata = await readMetadata(makeSettingsConfig(), ['collections', 'settings']);

      expect(metadata).toMatchObject(payloadMetadata);
      expect(mocks.executeAuthStrategies).not.toHaveBeenCalled();
    });

    it('generatePageMetadata keeps the favicon and OG image patches on a Settings route', async () => {
      const config = makeSettingsConfig({
        meta: { defaultOGImageType: 'static', titleSuffix: '- FrogBot' },
      });

      const metadata = await readMetadata(config, ['settings', 'collections']);

      expect(metadata.icons).toHaveLength(1);
      expect(metadata.openGraph?.images).toHaveLength(1);
      expect(metadata.openGraph?.title).toBe('Collections');
    });

    it.each([
      ['Collections', ['settings', 'collections'], 'Collections'],
      ['an entry', ['settings', 'billing'], 'Billing'],
      ['a denied entry', ['settings', 'vault'], 'Settings'],
    ])('SettingsView header matches the Settings tab title for %s', async (_, segments, text) => {
      const config = makeSettingsConfig({
        settings: [
          { Component: 'Billing', label: 'Billing', path: 'billing' },
          { access: () => false, Component: 'Vault', label: 'Vault', path: 'vault' },
        ],
      });

      const element = await SettingsView({
        importMap: {},
        initPageResult: {
          permissions: { collections: {} },
          req: { frogbot: mocks.frogbot, i18n: mocks.i18n, user: { id: 'user-1' } },
          visibleEntities: { collections: [], globals: [] },
        },
        payload: { config },
        routeSegments: segments,
      } as never);

      const title = await getSettingsTitle({ config: config as never, segments });

      const header = element.props.children[1].props.children[0];

      expect(header.props.className).toBe('frogbot-settings-template__header');
      expect(header.props.children).toBe(title);
      expect(title).toBe(text);
    });
  });
});
