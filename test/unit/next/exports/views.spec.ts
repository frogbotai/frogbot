import type { FrogbotSanitizedConfig } from 'frogbot';
import { type ComponentProps, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCachedFrogbot: vi.fn(() => ({
    config: {
      agents: [{ slug: 'general' }],
      chat: { enabled: true, chatsSlug: 'conversations', messagesSlug: 'turns' },
    },
  })),
  RootPage: vi.fn(() => null),
  NotFoundPage: vi.fn(() => null),
  generatePageMetadata: vi.fn((args: unknown) => Promise.resolve(args)),
  RenderServerComponent: vi.fn(() => 'rendered-setting'),
  redirect: vi.fn(),
}));

vi.mock('@payloadcms/next/views', () => mocks);
vi.mock('@payloadcms/ui/elements/RenderServerComponent', () => ({
  RenderServerComponent: mocks.RenderServerComponent,
}));
vi.mock('@payloadcms/ui', () => ({
  Card: ({ buttonAriaLabel, href, id, title }: Record<string, string>) =>
    createElement('a', { 'aria-label': buttonAriaLabel, href, id }, title),
  Link: ({ children, href, ...props }: ComponentProps<'a'>) =>
    createElement('a', { href, ...props }, children),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('../../../../packages/next/src/elements/Nav/index.js', () => ({ FrogbotNav: () => null }));
vi.mock('frogbot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('frogbot')>()),
  getCachedFrogbot: mocks.getCachedFrogbot,
  messagesToUIMessages: (messages: Array<Record<string, unknown>>) =>
    messages.map(({ id, role, parts, metadata }) => ({
      id: String(id),
      role,
      parts,
      ...(metadata == null ? {} : { metadata }),
    })),
}));

const {
  ChatView,
  CollectionSettingsRedirect,
  RootPage,
  NotFoundPage,
  SettingsView,
  generatePageMetadata,
} = await import('../../../../packages/next/src/exports/views.js');

function makeConfig(admin?: Record<string, unknown>) {
  const payloadConfig = { admin, collections: [] };
  const config = {
    _internal: { payloadConfig: Promise.resolve(payloadConfig) },
  } as unknown as FrogbotSanitizedConfig;
  return { config, payloadConfig };
}

const params = Promise.resolve({ segments: [] });
const searchParams = Promise.resolve({});

describe('@frogbotai/next views', () => {
  it('redirects collection settings entries through the configured admin route', () => {
    CollectionSettingsRedirect({
      collectionSlug: 'service-accounts',
      payload: { config: { routes: { admin: '/workspace' } } },
    } as never);

    expect(mocks.redirect).toHaveBeenCalledWith('/workspace/collections/service-accounts');
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
                icon: 'UsageIcon',
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
      Component: 'UsageIcon',
      importMap: props.importMap,
      serverProps: props,
    });
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

  it('SettingsView groups visible readable collections and links canonical custom admin routes', async () => {
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
            posts: { read: true },
            secrets: { read: false },
            users: { read: true },
          },
        },
        req: { i18n, user: { id: 'user-1' } },
        visibleEntities: { collections: ['posts', 'secrets', 'users'], globals: [] },
      },
      payload: {
        config: {
          admin: { routes: { account: '/account' }, settings: [] },
          collections: [
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
      initialMessages: [{ id: '12', role: 'assistant', parts, metadata: { source: 'test' } }],
    });
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
});
