import type * as frogbotModule from 'frogbot';
import type * as frogbotInternalModule from 'frogbot/internal';
import type * as payloadModule from 'payload';
import { type ComponentProps, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const frogbot = { attached: true };
  const i18n = { language: 'en', t: (key: string) => key };

  return {
    attachRegisteredFrogBot: vi.fn((req: Record<string, unknown>) =>
      Object.assign(req, { frogbot }),
    ),
    createPayloadRequest: vi.fn((options: { req?: Record<string, unknown> }) =>
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
    listDrawer: { isInDrawer: false },
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
    PayloadDefaultListView: vi.fn(() => null),
    ViewControls: vi.fn(() => null),
    DefaultTemplate: vi.fn(({ children }: { children?: ReactNode }) => children),
  };
});

vi.mock('@payloadcms/ui/elements/RenderServerComponent', () => ({
  RenderServerComponent: mocks.RenderServerComponent,
}));

vi.mock('@payloadcms/ui', () => ({
  Button: () => null,
  Card: ({ buttonAriaLabel, href, id, title }: Record<string, string>) =>
    createElement('a', { 'aria-label': buttonAriaLabel, href, id }, title),
  DefaultListView: mocks.PayloadDefaultListView,
  Gutter: ({ children, className }: ComponentProps<'div'>) =>
    createElement('div', { className }, children),
  SetStepNav: () => null,
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
      admin: { custom: { frogbot: { views: [{ type: 'list' }] } } },
      fields: [],
      labels: { plural: 'Posts', singular: 'Post' },
      slug: 'posts',
    }),
  }),
  useControllableState: (value: unknown) => [value],
  useListDrawerContext: () => mocks.listDrawer,
  useListQuery: () => ({ data: { docs: [], totalDocs: 0 } }),
  useModal: () => ({ openModal: vi.fn() }),
  useStepNav: () => ({ setStepNav: vi.fn() }),
  useTranslation: () => ({ i18n: { t: (key: string) => key } }),
  NoListResults: () => null,
  useWindowInfo: () => ({ breakpoints: { s: false } }),
  ViewDescription: () => null,
  withCondition: <T>(Component: T) => Component,
}));

vi.mock('@payloadcms/ui/elements/NoListResults', () => ({ NoListResults: () => null }));
vi.mock('@payloadcms/ui/elements/QueryPresets/QueryPresetBar', () => ({}));
vi.mock('@payloadcms/ui/elements/WhereBuilder', () => ({}));
vi.mock('@payloadcms/ui/icons/Dots', () => ({}));

vi.mock('@payloadcms/ui/rsc', () => ({
  getColumns: vi.fn(() => []),
  renderTable: vi.fn(() => ({ columnState: [], Table: null })),
}));

vi.mock('@payloadcms/ui/utilities/reduceFieldsToOptions', () => ({}));

vi.mock('../../../../../packages/ui/src/admin/views/controls/ViewControls.client.js', () => ({
  ViewControls: mocks.ViewControls,
}));

vi.mock('../../../../../packages/ui/src/admin/elements/Nav/index.js', () => ({
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
  createPayloadRequest: mocks.createPayloadRequest,
  executeAuthStrategies: mocks.executeAuthStrategies,
  getPayload: mocks.getPayload,
}));

vi.mock('../../../../../packages/ui/src/admin/templates/Default/index.js', () => ({
  DefaultTemplate: mocks.DefaultTemplate,
}));

const server = {
  notFound: () => {
    throw new Error('not-found');
  },
  redirect: mocks.redirect,
};

const { ChatView } = await import('../../../../../packages/ui/src/admin/views/Chat/index.js');
const { CollectionViewShell } =
  await import('../../../../../packages/ui/src/admin/views/CollectionViewShell.js');

const { DefaultListView } =
  await import('../../../../../packages/ui/src/admin/views/List/DefaultListView.client.js');

const { SettingsView: RenderSettingsView } =
  await import('../../../../../packages/ui/src/admin/views/Settings/index.js');

const SettingsView = (props: Parameters<typeof RenderSettingsView>[0]) =>
  RenderSettingsView(Object.assign(props, { server }));

describe('FrogBot admin views', () => {
  afterEach(() => {
    mocks.listDrawer.isInDrawer = false;
  });

  it('exports DefaultListView', () => {
    expect(DefaultListView).toBeTypeOf('function');
  });

  it("DefaultListView renders Payload's list view with the given props", () => {
    mocks.PayloadDefaultListView.mockClear();

    const props = {
      collectionSlug: 'posts',
      columnState: [],
      hasCreatePermission: true,
      hasDeletePermission: true,
      Table: createElement('table'),
      viewType: 'default',
    };

    renderToStaticMarkup(createElement(DefaultListView, props as never));

    expect(mocks.PayloadDefaultListView).toHaveBeenCalledWith(props, undefined);
  });

  it('CollectionViewShell renders the view slots in the frame and counts its records', async () => {
    mocks.RenderServerComponent.mockImplementation(({ Component }) => `slot:${String(Component)}`);
    const child = createElement('span', { 'data-cell': 'custom' }, 'Cell');
    const count = vi.fn(() => Promise.resolve({ totalDocs: 0 }));
    const view = {
      components: {
        afterView: ['AfterView'],
        beforeView: ['BeforeView'],
        menuItems: ['Menu'],
        toolbar: ['Toolbar'],
      },
      filter: { archived: { equals: false } },
      slug: 'stub',
      type: 'custom',
    };

    const element = await CollectionViewShell({
      children: child,
      clientConfig: { routes: { admin: '/admin' } },
      collectionConfig: {
        admin: { components: { CreateButton: 'Create', Description: 'Description' } },
        custom: { frogbot: { collectionViews: [view] } },
        labels: { plural: 'Posts', singular: 'Post' },
        slug: 'posts',
      },
      collectionSlug: 'posts',
      importMap: {},
      initPageResult: {
        permissions: { collections: { posts: { create: true, delete: true } } },
        req: {
          i18n: { t: (key: string) => key },
          payload: { count },
          query: { sort: '-createdAt', where: { status: { equals: 'draft' } } },
        },
      },
      viewType: 'stub',
      view,
      views: [{ label: 'Stub', path: '', slug: 'stub', type: 'custom' }],
    } as never);

    const [toolbar, create] = element?.props.Toolbar as ReactNode[];

    expect(element?.props).toMatchObject({
      AfterList: 'slot:AfterView',
      BeforeList: 'slot:BeforeView',
      Description: 'slot:Description',
      hasCreateButton: true,
      hasCreatePermission: true,
      isEmpty: true,
      query: { sort: '-createdAt', where: { status: { equals: 'draft' } } },
      type: 'custom',
    });
    expect(element?.props.listMenuItems[0]).toBe('slot:Menu');
    expect(toolbar).toBe('slot:Toolbar');
    expect(renderToStaticMarkup(create as never)).toBe(
      '<div class="fb-create-button">slot:Create</div>',
    );
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        overrideAccess: false,
        where: { and: [{ archived: { equals: false } }, { status: { equals: 'draft' } }] },
      }),
    );
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

    const content = element.props.children[1].props.children;

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

    const content = element.props.children[1].props.children;
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

  it("SettingsView leaves group false and admin.hidden collections off the Collections cards, as Payload's dashboard does", async () => {
    const i18n = {
      t: (key: string) =>
        ({ 'general:collections': 'Collections', 'general:globals': 'Globals' })[key] ?? key,
    };

    const element = await SettingsView({
      importMap: {},
      initPageResult: {
        permissions: {
          collections: {
            hidden: { read: true },
            posts: { read: true },
            users: { read: true },
            media: { read: true },
          },
        },
        req: { i18n, user: { id: 'user-1' } },
        visibleEntities: { collections: ['media', 'users', 'posts'], globals: [] },
      },
      payload: {
        config: {
          admin: { routes: { account: '/account' }, settings: [] },
          collections: [
            { admin: {}, labels: { plural: 'Media' }, slug: 'media' },
            { admin: { group: 'Content' }, labels: { plural: 'Posts' }, slug: 'posts' },
            { admin: { group: false }, labels: { plural: 'Users' }, slug: 'users' },
            { admin: { hidden: true }, labels: { plural: 'Hidden' }, slug: 'hidden' },
          ],
          routes: { admin: '/admin' },
        },
      },
      routeSegments: ['settings', 'collections'],
    } as never);

    const content = element.props.children[1].props.children;
    const html = renderToStaticMarkup(content);

    expect(html).toContain('id="card-posts"');
    expect(html).not.toContain('id="card-users"');
    expect(html).not.toContain('Hidden');
    expect(html.indexOf('id="card-media"')).toBeLessThan(html.indexOf('<h2>Content</h2>'));
  });

  it('SettingsView leaves Settings collections off the Collections cards', async () => {
    const i18n = {
      t: (key: string) =>
        ({ 'general:collections': 'Collections', 'general:globals': 'Globals' })[key] ?? key,
    };

    const element = await SettingsView({
      importMap: {},
      initPageResult: {
        permissions: { collections: { posts: { read: true }, users: { read: true } } },
        req: { i18n, user: { id: 'user-1' } },
        visibleEntities: { collections: ['posts', 'users'], globals: [] },
      },
      payload: {
        config: {
          admin: { routes: { account: '/account' }, settings: [] },
          collections: [
            { admin: {}, labels: { plural: 'Posts' }, slug: 'posts' },
            { admin: { group: false, settings: true }, labels: { plural: 'Users' }, slug: 'users' },
          ],
          routes: { admin: '/admin' },
        },
      },
      routeSegments: ['settings', 'collections'],
    } as never);

    const html = renderToStaticMarkup(element.props.children[1].props.children);

    expect(html).toContain('id="card-posts"');
    expect(html).not.toContain('id="card-users"');
  });

  it('SettingsView renders in the default template with the page title as its step nav', async () => {
    mocks.DefaultTemplate.mockClear();

    const req = { i18n: mocks.i18n, user: { id: 'user-1' } };
    const initPageResult = {
      locale: { code: 'en' },
      permissions: { collections: {} },
      req,
      visibleEntities: { collections: [], globals: [] },
    };

    const element = await SettingsView({
      importMap: {},
      initPageResult,
      params: { segments: ['settings', 'usage'] },
      payload: {
        config: {
          admin: {
            routes: { account: '/account' },
            settings: [{ Component: 'Usage', label: 'Usage', path: 'usage' }],
          },
          collections: [],
          routes: { admin: '/admin' },
        },
      },
      searchParams: { tab: 'a' },
    } as never);

    const [stepNav, gutter] = element.props.children;

    expect(element.props).toMatchObject({
      locale: initPageResult.locale,
      params: { segments: ['settings', 'usage'] },
      permissions: initPageResult.permissions,
      req,
      searchParams: { tab: 'a' },
      user: req.user,
      visibleEntities: initPageResult.visibleEntities,
    });
    expect(stepNav.props.nav).toEqual([{ label: 'Usage' }]);
    expect(gutter.props.className).toBe('frogbot-settings');
    expect(mocks.RenderServerComponent).toHaveBeenLastCalledWith(
      expect.objectContaining({ Component: 'Usage' }),
    );
    expect(gutter.props.children).toBe(mocks.RenderServerComponent.mock.results.at(-1)?.value);
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
      chatsSlug: 'conversations',
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
      chatsSlug: 'conversations',
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
      chatsSlug: 'conversations',
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
      chatsSlug: 'conversations',
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
});
