import { RobotIcon, SettingIcon } from '@frogbotai/ui/icons';
import type { FrogBotSanitizedConfig } from 'frogbot';
import { type ComponentProps, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const frogbot = { attached: true };
  const i18n = { language: 'en', t: (key: string) => key };

  return {
    attachRegisteredFrogBot: vi.fn((req: Record<string, unknown>) => ({ ...req, frogbot })),
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
    RenderServerComponent: vi.fn(() => 'rendered-setting'),
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
vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('../../../../packages/next/src/views/controls/ViewControls.client.js', () => ({
  ViewControls: mocks.ViewControls,
}));
vi.mock('../../../../packages/next/src/elements/Nav/index.js', () => ({ FrogBotNav: () => null }));
vi.mock('frogbot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('frogbot')>()),
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
  ...(await importOriginal<typeof import('frogbot/internal')>()),
  attachRegisteredFrogBot: mocks.attachRegisteredFrogBot,
}));
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  createLocalReq: mocks.createLocalReq,
  executeAuthStrategies: mocks.executeAuthStrategies,
  getPayload: mocks.getPayload,
}));
vi.mock('@payloadcms/next/utilities', () => ({ getNextRequestI18n: mocks.getNextRequestI18n }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));

const {
  ChatView,
  RootPage,
  NotFoundPage,
  SettingsView,
  generatePageMetadata,
  CollectionViewShell,
  DefaultListView,
} = await import('../../../../packages/next/src/exports/views.js');
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
  it('exports DefaultListView', () => {
    expect(DefaultListView).toBeTypeOf('function');
  });

  it.each([
    ['enabled by default', undefined, true],
    ['disabled by the list view', false, false],
  ] as const)(
    'DefaultListView renders ViewControls with sort enabled and Group By %s',
    (_, groupBy, expected) => {
      mocks.ViewControls.mockClear();
      mocks.listGroupBy = groupBy;

      renderToStaticMarkup(
        createElement(DefaultListView, {
          collectionSlug: 'posts',
          columnState: [],
          hasCreatePermission: true,
          hasDeletePermission: true,
          Table: createElement('table'),
          viewType: 'default',
        } as never),
      );

      expect(mocks.ViewControls).toHaveBeenCalledWith(
        expect.objectContaining({
          collectionSlug: 'posts',
          enableGroupBy: expected,
          enableSort: true,
        }),
        undefined,
      );
    },
  );

  it('CollectionViewShell renders shared slots and custom cell content', () => {
    mocks.RenderServerComponent.mockImplementation(({ Component }) => `slot:${String(Component)}`);
    const child = createElement('span', { 'data-cell': 'custom' }, 'Cell');
    const element = CollectionViewShell({
      children: child,
      clientConfig: {
        collections: [
          { admin: {}, fields: [], labels: { plural: 'Posts', singular: 'Post' }, slug: 'posts' },
        ],
        routes: { admin: '/admin' },
      },
      collectionConfig: {
        admin: {
          components: {
            Description: 'Description',
            views: {
              stub: {
                frogbot: {
                  components: {
                    actions: ['Action'],
                    afterView: ['AfterView'],
                    beforeView: ['BeforeView'],
                    menuItems: ['Menu'],
                  },
                },
              },
            },
          },
        },
        slug: 'posts',
      },
      collectionSlug: 'posts',
      importMap: {},
      initPageResult: {
        permissions: { collections: { posts: { create: true, delete: true } } },
        req: { i18n: {}, query: { sort: '-createdAt', where: { status: { equals: 'draft' } } } },
      },
      viewSlug: 'stub',
      viewType: 'stub',
      viewComponents: {
        actions: ['Action'],
        afterView: ['AfterView'],
        beforeView: ['BeforeView'],
        menuItems: ['Menu'],
      },
      views: [{ label: 'Stub', path: '', slug: 'stub', type: 'custom' }],
    } as never);

    expect(element?.props).toMatchObject({
      AfterList: 'slot:AfterView',
      Actions: ['slot:Action'],
      BeforeList: 'slot:BeforeView',
      Description: 'slot:Description',
      hasCreatePermission: true,
      listMenuItems: ['slot:Menu'],
      query: { sort: '-createdAt', where: { status: { equals: 'draft' } } },
    });
    expect(element?.props.children).toBe(child);
  });

  it('SettingsView resolves the longest exact or prefix entry and enforces access', async () => {
    const req = { user: { id: 'user-1' } };
    const parentAccess = vi.fn(() => true);
    const nestedAccess = vi.fn(() => true);
    const payload = {
      config: {
        admin: {
          routes: { account: '/account' },
          settings: [
            { access: parentAccess, Component: 'Parent', path: 'billing' },
            { access: nestedAccess, Component: 'Nested', path: 'billing/invoices' },
          ],
        },
        routes: { admin: '/admin' },
      },
    };
    const props = {
      importMap: {},
      initPageResult: { req, visibleEntities: { collections: [], globals: [] } },
      payload,
      routeSegments: ['settings', 'billing', 'invoices', 'invoice-1'],
    } as never;

    await SettingsView(props);

    expect(parentAccess).toHaveBeenCalledWith({ req });
    expect(nestedAccess).toHaveBeenCalledWith({ req });
    expect(mocks.RenderServerComponent).toHaveBeenCalledWith({
      Component: 'Nested',
      importMap: {},
      serverProps: props,
    });
  });

  it('SettingsView defaults access to authenticated users and hides denied routes', async () => {
    mocks.RenderServerComponent.mockClear();
    const payload = {
      config: {
        admin: {
          routes: { account: '/account' },
          settings: [{ Component: 'Usage', path: 'usage' }],
        },
        routes: { admin: '/admin' },
      },
    };
    const element = await SettingsView({
      importMap: {},
      initPageResult: {
        req: { user: null },
        visibleEntities: { collections: [], globals: [] },
      },
      payload,
      routeSegments: ['settings', 'usage'],
    } as never);

    expect(mocks.RenderServerComponent).not.toHaveBeenCalled();
    const content = element.props.children[1].props.children[1].props.children;
    expect(content.props.className).toBe('frogbot-settings__not-found');
  });

  it('SettingsView redirects the settings root to Collections', async () => {
    await SettingsView({
      importMap: {},
      initPageResult: {
        req: { user: { id: 'user-1' } },
        visibleEntities: { collections: [], globals: [] },
      },
      params: { segments: ['settings'] },
      payload: {
        config: {
          admin: { routes: { account: '/account' }, settings: [] },
          routes: { admin: '/admin' },
        },
      },
    } as never);

    expect(mocks.redirect).toHaveBeenCalledWith('/admin/settings/collections');
  });

  it('SettingsView renders accessible nested entries with their icon and canonical path', async () => {
    mocks.RenderServerComponent.mockClear();
    mocks.RenderServerComponent.mockReturnValueOnce(
      createElement('svg', { 'data-icon': 'usage' }) as never,
    );
    const access = vi.fn(() => true);
    const props = {
      importMap: { Icon: 'resolved' },
      initPageResult: {
        req: { user: { id: 'user-1' } },
        visibleEntities: { collections: [], globals: [] },
      },
      payload: {
        config: {
          admin: {
            routes: { account: '/account' },
            settings: [
              {
                access,
                Component: 'UsagePage',
                icon: './UsageIcon#UsageIcon',
                label: 'Usage',
                path: 'workspace/usage',
              },
            ],
          },
          collections: [],
          routes: { admin: '/control' },
        },
      },
      routeSegments: ['settings', 'workspace', 'usage'],
    } as never;

    const element = await SettingsView(props);
    const html = renderToStaticMarkup(element);

    expect(access).toHaveBeenCalledWith({ req: props.initPageResult.req });
    expect(html).toContain('href="/control/settings/workspace/usage"');
    expect(html).toContain('>Usage<');
    expect(html).toContain('data-icon="usage"');
    expect(mocks.RenderServerComponent).toHaveBeenCalledWith({
      Component: './UsageIcon#UsageIcon',
      clientProps: { size: 18 },
      importMap: props.importMap,
      serverProps: props,
    });
  });

  it('SettingsView renders a built-in settings icon from the icon registry', async () => {
    mocks.RenderServerComponent.mockClear();

    const element = await SettingsView({
      importMap: {},
      initPageResult: {
        req: { user: { id: 'user-1' } },
        visibleEntities: { collections: [], globals: [] },
      },
      payload: {
        config: {
          admin: {
            routes: { account: '/account' },
            settings: [{ Component: 'RobotPage', icon: 'robot', label: 'Robot', path: 'robot' }],
          },
          collections: [],
          routes: { admin: '/admin' },
        },
      },
      routeSegments: ['settings', 'robot'],
    } as never);
    const html = renderToStaticMarkup(element);

    expect(html).toContain(renderToStaticMarkup(createElement(RobotIcon, { size: 18 })));
    expect(mocks.RenderServerComponent).not.toHaveBeenCalledWith(
      expect.objectContaining({ Component: 'robot' }),
    );
  });

  it('SettingsView renders component object icons and falls back for empty icons', async () => {
    mocks.RenderServerComponent.mockClear();

    const icon = { exportName: 'UsageIcon', path: './UsageIcon' };
    const props = {
      importMap: {},
      initPageResult: {
        req: { user: { id: 'user-1' } },
        visibleEntities: { collections: [], globals: [] },
      },
      payload: {
        config: {
          admin: {
            routes: { account: '/account' },
            settings: [
              { Component: 'UsagePage', icon, label: 'Usage', path: 'usage' },
              { Component: 'EmptyPage', icon: '', label: 'Empty', path: 'empty' },
            ],
          },
          collections: [],
          routes: { admin: '/admin' },
        },
      },
      routeSegments: ['settings', 'usage'],
    } as never;

    mocks.RenderServerComponent.mockImplementation((({ Component }: { Component: unknown }) =>
      Component === icon ? createElement('svg', { 'data-icon': 'object' }) : null) as never);

    const html = renderToStaticMarkup(await SettingsView(props));

    mocks.RenderServerComponent.mockImplementation(() => 'rendered-setting');

    expect(html).toContain('data-icon="object"');
    expect(mocks.RenderServerComponent).toHaveBeenCalledWith({
      Component: icon,
      clientProps: { size: 18 },
      importMap: {},
      serverProps: props,
    });
    expect(mocks.RenderServerComponent).not.toHaveBeenCalledWith(
      expect.objectContaining({ Component: '' }),
    );
    expect(html).toContain(renderToStaticMarkup(createElement(SettingIcon, { size: 18 })));
  });

  it.each([
    ['root', '/', '/settings/usage'],
    ['default', '/admin', '/admin/settings/usage'],
    ['custom', '/control', '/control/settings/usage'],
  ])(
    'SettingsView formats the %s admin route without a protocol-relative URL',
    async (_, adminRoute, expected) => {
      const element = await SettingsView({
        importMap: {},
        initPageResult: {
          req: { user: { id: 'user-1' } },
          visibleEntities: { collections: [], globals: [] },
        },
        payload: {
          config: {
            admin: {
              routes: { account: '/account' },
              settings: [{ Component: 'UsagePage', label: 'Usage', path: 'usage' }],
            },
            routes: { admin: adminRoute },
          },
        },
        routeSegments: ['settings', 'usage'],
      } as never);

      const html = renderToStaticMarkup(element);
      expect(html).toContain(`href="${expected}"`);
      expect(html).not.toContain('href="//');
    },
  );

  it('SettingsView omits denied entries from the server-rendered navigation', async () => {
    const denied = vi.fn(() => false);
    const element = await SettingsView({
      importMap: {},
      initPageResult: {
        req: { user: { id: 'user-1' } },
        visibleEntities: { collections: [], globals: [] },
      },
      payload: {
        config: {
          admin: {
            routes: { account: '/account' },
            settings: [
              { access: denied, Component: 'Secret', label: 'Secret', path: 'secret/nested' },
            ],
          },
          collections: [],
          routes: { admin: '/admin' },
        },
      },
      routeSegments: ['settings', 'missing'],
    } as never);

    const html = renderToStaticMarkup(element);
    expect(denied).toHaveBeenCalledOnce();
    expect(html).not.toContain('Secret');
    expect(html).toContain('href="/admin/settings/collections"');
    expect(html).toContain('href="/admin/account"');
  });

  it('SettingsView lists ungrouped collections without a group heading and labels developer groups', async () => {
    const i18n = {
      t: (key: string, args?: { label?: string }) =>
        key === 'general:collections'
          ? 'Collections'
          : key === 'general:globals'
            ? 'Globals'
            : `Show all ${args?.label}`,
    };
    const element = await SettingsView({
      importMap: {},
      initPageResult: {
        permissions: {
          collections: {
            media: { read: true },
            posts: { read: true },
            secrets: { read: false },
            users: { read: true },
          },
        },
        req: { i18n, user: { id: 'user-1' } },
        visibleEntities: { collections: ['media', 'posts', 'secrets', 'users'], globals: [] },
      },
      payload: {
        config: {
          admin: { routes: { account: '/account' }, settings: [] },
          collections: [
            { admin: {}, labels: { plural: 'Media' }, slug: 'media' },
            { admin: { group: 'Content' }, labels: { plural: 'Posts' }, slug: 'posts' },
            { admin: { group: 'Content' }, labels: { plural: 'Secrets' }, slug: 'secrets' },
            { admin: { group: 'Team' }, labels: { plural: 'Users' }, slug: 'users' },
            { admin: { group: 'Content' }, labels: { plural: 'Hidden' }, slug: 'hidden' },
          ],
          routes: { admin: '/control' },
        },
      },
      routeSegments: ['settings', 'collections'],
    } as never);

    const content = element.props.children[1].props.children[1].props.children;
    const html = renderToStaticMarkup(content);

    expect(html).not.toContain('<h2>Collections</h2>');
    expect(html).toContain('href="/control/collections/media"');
    expect(html.indexOf('href="/control/collections/media"')).toBeLessThan(
      html.indexOf('<h2>Content</h2>'),
    );
    expect(html).toContain('<h2>Content</h2>');
    expect(html).toContain('<h2>Team</h2>');
    expect(html).toContain('href="/control/collections/posts"');
    expect(html).toContain('href="/control/collections/users"');
    expect(html).toContain('aria-label="Show all Posts"');
    expect(html).not.toContain('Secrets');
    expect(html).not.toContain('Hidden');
  });

  it('SettingsView excludes collections hidden from canonical navigation groups', async () => {
    const i18n = {
      t: (key: string) =>
        ({ 'general:collections': 'Collections', 'general:globals': 'Globals' })[key] ?? key,
    };
    const element = await SettingsView({
      importMap: {},
      initPageResult: {
        permissions: { collections: { internal: { read: true }, posts: { read: true } } },
        req: { i18n, user: { id: 'user-1' } },
        visibleEntities: { collections: ['internal', 'posts'], globals: [] },
      },
      payload: {
        config: {
          admin: { routes: { account: '/account' }, settings: [] },
          collections: [
            { admin: { group: false }, labels: { plural: 'Internal' }, slug: 'internal' },
            { admin: {}, labels: { plural: 'Posts' }, slug: 'posts' },
          ],
          routes: { admin: '/admin' },
        },
      },
      routeSegments: ['settings', 'collections'],
    } as never);

    const content = element.props.children[1].props.children[1].props.children;
    const html = renderToStaticMarkup(content);

    expect(html).toContain('href="/admin/collections/posts"');
    expect(html).not.toContain('Internal');
  });

  it('ChatView prefetches bounded, access-filtered messages for the document route', async () => {
    const parts = [{ type: 'file', mediaType: 'image/png', url: '/api/files/1' }];
    const user = { id: 'user-1' };
    const find = vi.fn(() =>
      Promise.resolve({
        docs: [{ id: 12, role: 'assistant', parts, metadata: { source: 'test' } }],
      }),
    );

    const element = await ChatView({
      doc: { id: 'ignored-doc-id', agent: 'general' },
      payload: { config: { routes: { admin: '/admin' } }, find },
      routeSegments: ['collections', 'conversations', 'chat-1'],
      user,
    } as never);

    expect(find).toHaveBeenCalledWith({
      collection: 'turns',
      depth: 0,
      limit: 500,
      overrideAccess: false,
      sort: ['createdAt', 'id'],
      user,
      where: { chat: { equals: 'chat-1' } },
    });
    expect(element?.props).toEqual({
      agent: 'general',
      chatId: 'chat-1',
      documentPath: '/admin/collections/conversations',
      initialChat: {
        id: 'chat-1',
        agent: 'general',
        title: null,
        channel: null,
        channelLabel: null,
      },
      initialMessages: [{ id: '12', role: 'assistant', parts, metadata: { source: 'test' } }],
    });
  });

  it('ChatView starts an existing chat at its latest active user message selection', async () => {
    const user = { id: 'user-1' };
    const latest = { id: 14, role: 'user', parts: [], model: 'openai/gpt-5', reasoning: 'high' };
    const find = vi.fn(({ limit }: { limit: number }) =>
      Promise.resolve({ docs: limit === 1 ? [latest] : [] }),
    );

    const element = await ChatView({
      doc: { id: 'chat-1', agent: 'general' },
      payload: { config: { routes: { admin: '/admin' } }, find },
      routeSegments: ['collections', 'conversations', 'chat-1'],
      user,
    } as never);

    expect(find).toHaveBeenCalledWith({
      collection: 'turns',
      depth: 0,
      limit: 1,
      overrideAccess: false,
      sort: ['-createdAt', '-id'],
      user,
      where: {
        and: [
          { chat: { equals: 'chat-1' } },
          { role: { equals: 'user' } },
          { status: { not_equals: 'queued' } },
        ],
      },
    });
    expect(element?.props.initialSelection).toEqual({ model: 'openai/gpt-5', reasoning: 'high' });
  });

  it('ChatView leaves the selection to preferences when the latest message has no model', async () => {
    const find = vi.fn(({ limit }: { limit: number }) =>
      Promise.resolve({ docs: limit === 1 ? [{ id: 14, role: 'user', parts: [] }] : [] }),
    );

    const element = await ChatView({
      doc: { id: 'chat-1', agent: 'general' },
      payload: { config: { routes: { admin: '/admin' } }, find },
      routeSegments: ['collections', 'conversations', 'chat-1'],
      user: { id: 'user-1' },
    } as never);

    expect(element?.props.initialSelection).toBeUndefined();
  });

  it('ChatView renders an empty uncontrolled chat on the canonical create route', async () => {
    const find = vi.fn();
    const element = await ChatView({
      doc: {},
      payload: { config: { routes: { admin: '/control' } }, find },
      routeSegments: ['collections', 'conversations', 'create'],
      user: { id: 'user-1' },
    } as never);

    expect(find).not.toHaveBeenCalled();
    expect(element?.props).toEqual({
      agent: 'general',
      documentPath: '/control/collections/conversations',
      initialMessages: [],
    });
  });

  it('ChatView renders an empty uncontrolled chat on the dashboard route', async () => {
    const find = vi.fn();
    const element = await ChatView({
      doc: {},
      payload: { config: { routes: { admin: '/admin' } }, find },
      routeSegments: [],
      user: { id: 'user-1' },
    } as never);

    expect(find).not.toHaveBeenCalled();
    expect(element?.props).toEqual({
      agent: 'general',
      documentPath: '/admin/collections/conversations',
      initialMessages: [],
    });
  });

  it('ChatView treats missing routeSegments as the dashboard route', async () => {
    const find = vi.fn();
    const element = await ChatView({
      doc: {},
      payload: { config: { routes: { admin: '/admin' } }, find },
      user: { id: 'user-1' },
    } as never);

    expect(find).not.toHaveBeenCalled();
    expect(element?.props).toEqual({
      agent: 'general',
      documentPath: '/admin/collections/conversations',
      initialMessages: [],
    });
  });

  it('ChatView does not query when canonical view auth has no user', async () => {
    const find = vi.fn();

    await expect(
      ChatView({
        doc: { id: 'chat-1', agent: 'general' },
        payload: { find },
        routeSegments: ['collections', 'conversations', 'chat-1'],
      } as never),
    ).resolves.toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

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
      Component: '@frogbotai/next/views#SettingsView',
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
