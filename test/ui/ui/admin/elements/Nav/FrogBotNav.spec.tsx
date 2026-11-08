import { HomeIcon } from '@frogbotai/ui/icons';
import { render, screen } from '@testing-library/react';
import type * as frogbotInternalModule from 'frogbot/internal';
import type { PayloadRequest, ServerProps } from 'payload';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CollectionsSection } from '../../../../../../packages/ui/src/admin/elements/Nav/CollectionsSection';
import { FrogBotNav } from '../../../../../../packages/ui/src/admin/elements/Nav/index';

type NavClientProps = {
  CustomAvatar?: ReactNode;
  afterAccountMenu?: ReactNode;
  beforeAccountMenu?: ReactNode;
  items?: unknown[];
  logout?: ReactNode;
  palette?: unknown;
  sections?: ReactNode;
};

const navClient = vi.hoisted(() =>
  vi.fn(({ afterAccountMenu, beforeAccountMenu, logout, sections }: NavClientProps) => (
    <nav>
      {sections}
      {beforeAccountMenu}
      {afterAccountMenu}
      {logout}
    </nav>
  )),
);

const renderLog = vi.hoisted(() => [] as string[]);

const attachRegisteredFrogBot = vi.hoisted(() =>
  vi.fn((req: { frogbot?: unknown }) => {
    renderLog.push('attach');
    req.frogbot = { marker: 'frogbot' };

    return req;
  }),
);

vi.mock('frogbot/internal', async (importOriginal) => ({
  ...(await importOriginal<typeof frogbotInternalModule>()),
  attachRegisteredFrogBot,
}));

vi.mock('@payloadcms/ui', () => ({
  Account: () => <span />,
  AnimateHeight: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Link: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePreferences: () => ({
    getPreference: vi.fn().mockResolvedValue(null),
    setPreference: vi.fn(),
  }),
}));

vi.mock('../../../../../../packages/ui/src/admin/elements/Nav/index.client', () => ({
  FrogBotNavClient: navClient,
  FrogBotSettingsNavClient: navClient,
}));

const sectionPath = './NavSection#VisibleEntitiesSection';
const collectionsSectionPath = '@frogbotai/ui/admin/rsc#CollectionsSection';
const navIconPath = './NavIcon#NavIcon';

const beforeAccountPath = './AccountMenu#BeforeAccount';
const afterAccountPath = './AccountMenu#AfterAccount';
const settingsMenuPath = './AccountMenu#SettingsItem';
const logoutPath = './AccountMenu#LogoutProbe';

function accountMenuProbe(name: string) {
  return function AccountMenuProbe({ req }: { req?: { frogbot?: unknown } }) {
    renderLog.push(name);

    return <span data-testid={`probe-${name}`}>{req?.frogbot ? 'attached' : 'missing'}</span>;
  };
}

const accountMenuComponents = {
  afterAccountMenu: [afterAccountPath],
  beforeAccountMenu: [beforeAccountPath],
  logout: { Button: logoutPath },
  settingsMenu: [settingsMenuPath],
};

function accountMenuProps({
  components = accountMenuComponents,
  withReq = true,
}: { components?: Record<string, unknown>; withReq?: boolean } = {}) {
  const base = props();

  return {
    ...base,
    payload: {
      ...base.payload,
      config: {
        ...base.payload.config,
        admin: {
          ...base.payload.config.admin,
          components,
        },
      },
      importMap: {
        [afterAccountPath]: accountMenuProbe('after-account'),
        [beforeAccountPath]: accountMenuProbe('before-account'),
        [logoutPath]: accountMenuProbe('logout'),
        [settingsMenuPath]: accountMenuProbe('settings-menu'),
      },
    },
    req: withReq ? base.req : undefined,
  } as unknown as { req?: PayloadRequest } & ServerProps;
}

function VisibleEntitiesSection({ visibleEntities }: ServerProps) {
  return <p>{visibleEntities?.collections.join(', ')}</p>;
}

function PageSection({ collectionSlug, docID }: { collectionSlug?: string; docID?: number }) {
  return <p data-testid="page-section">{`${collectionSlug}/${docID}`}</p>;
}

function NavIcon({ className, size }: { className?: string; size?: number }) {
  return <svg className={className} data-size={size} data-testid="nav-icon" />;
}

function navItemProps(
  navItems: { icon?: string | { exportName: string; path: string }; label: string; path: string }[],
) {
  const base = props();

  return {
    ...base,
    payload: {
      ...base.payload,
      config: {
        ...base.payload.config,
        admin: { ...base.payload.config.admin, components: { navItems } },
      },
      importMap: { [navIconPath]: NavIcon },
    },
  } as unknown as { req: PayloadRequest } & ServerProps;
}

function renderedItemIcon(index: number) {
  const items = navClient.mock.calls[0]?.[0].items as { icon?: ReactNode }[] | undefined;

  return <>{items?.[index]?.icon}</>;
}

function props() {
  const req = { user: { collection: 'users', id: 'user-1' } } as PayloadRequest;
  const find = vi.fn().mockResolvedValue({ docs: [] });

  req.payload = { find } as unknown as PayloadRequest['payload'];

  return {
    i18n: { t: (key: string) => key },
    payload: {
      config: {
        admin: {
          components: { navSections: [sectionPath] },
          routes: { account: '/account', logout: '/logout' },
        },
        collections: [],
        globals: [],
        routes: { admin: '/admin' },
      },
      find,
      importMap: { [sectionPath]: VisibleEntitiesSection },
    },
    permissions: { collections: {}, globals: {} },
    req,
    user: req.user,
    visibleEntities: { collections: ['posts', 'chats'], globals: [] },
  } as unknown as { req: PayloadRequest } & ServerProps;
}

function defaultSectionProps(
  permissions: {
    collections: Record<string, { read: boolean }>;
    globals: Record<string, never>;
  } = {
    collections: { chats: { read: true }, posts: { read: true } },
    globals: {},
  },
) {
  const base = props();

  return {
    ...base,
    i18n: { language: 'en', t: (key: string) => key },
    payload: {
      ...base.payload,
      config: {
        ...base.payload.config,
        admin: {
          ...base.payload.config.admin,
          components: { navSections: [collectionsSectionPath] },
        },
        collections: [
          { admin: {}, labels: { plural: 'Posts', singular: 'Post' }, slug: 'posts' },
          {
            admin: { icon: 'bubble-chat' },
            labels: { plural: 'Chats', singular: 'Chat' },
            slug: 'chats',
          },
        ],
      },
      importMap: { [collectionsSectionPath]: CollectionsSection },
    },
    permissions,
  } as unknown as { req: PayloadRequest } & ServerProps;
}

describe('FrogBotNav', () => {
  beforeEach(() => {
    navClient.mockClear();
    attachRegisteredFrogBot.mockClear();
    renderLog.length = 0;
  });

  it('attaches req.frogbot before rendering account-menu slots', async () => {
    const navProps = accountMenuProps();

    render(await FrogBotNav(navProps));

    expect(screen.getByTestId('probe-before-account').textContent).toBe('attached');
    expect(screen.getByTestId('probe-after-account').textContent).toBe('attached');
    expect(screen.getByTestId('probe-logout').textContent).toBe('attached');
    expect(attachRegisteredFrogBot).toHaveBeenCalledExactlyOnceWith(navProps.req);
    expect(renderLog[0]).toBe('attach');
  });

  it('gives the Settings sidebar Log out and the account-menu slots', async () => {
    const navProps = accountMenuProps({
      components: {
        ...accountMenuComponents,
        views: { settings: { Component: '@frogbotai/ui/admin/rsc#SettingsView' } },
      },
    });

    render(await FrogBotNav({ ...navProps, viewType: 'account' }));

    const settingsNav = navClient.mock.calls[0]?.[0] as NavClientProps & { logoutPath?: string };

    expect(settingsNav).toHaveProperty('backHref', '/admin');
    expect(settingsNav.logoutPath).toBe('/admin/logout');
    expect(screen.getByTestId('probe-before-account').textContent).toBe('attached');
    expect(screen.getByTestId('probe-after-account').textContent).toBe('attached');
    expect(screen.getByTestId('probe-settings-menu').textContent).toBe('attached');
    expect(screen.getByTestId('probe-logout').textContent).toBe('attached');
  });

  it('skips the attach when no req is passed', async () => {
    render(await FrogBotNav(accountMenuProps({ withReq: false })));

    expect(attachRegisteredFrogBot).not.toHaveBeenCalled();
    expect(screen.getByTestId('probe-before-account').textContent).toBe('missing');
    expect(screen.getByTestId('probe-after-account').textContent).toBe('missing');
    expect(screen.getByTestId('probe-logout').textContent).toBe('missing');
  });

  it('renders beforeAccountMenu, afterAccountMenu, and settingsMenu in order', async () => {
    render(await FrogBotNav(accountMenuProps()));

    const { afterAccountMenu, beforeAccountMenu } = navClient.mock.calls[0][0];
    const before = render(<>{beforeAccountMenu}</>).container;
    const after = render(<>{afterAccountMenu}</>).container;

    expect(
      [...before.querySelectorAll('[data-testid]')].map((node) => node.getAttribute('data-testid')),
    ).toEqual(['probe-before-account']);
    expect(
      [...after.querySelectorAll('[data-testid]')].map((node) => node.getAttribute('data-testid')),
    ).toEqual(['probe-after-account', 'probe-settings-menu']);
  });

  it('renders only the configured account-menu list when the other is empty', async () => {
    const navProps = accountMenuProps({
      components: { afterAccountMenu: [afterAccountPath], beforeAccountMenu: [] },
    });

    render(await FrogBotNav(navProps));

    const { afterAccountMenu, beforeAccountMenu, logout } = navClient.mock.calls[0][0];

    expect(render(<>{beforeAccountMenu}</>).container.innerHTML).toBe('');
    expect(render(<>{afterAccountMenu}</>).container.textContent).toBe('attached');
    expect(logout).toBeUndefined();
  });

  it('forwards CustomAvatar to the client unchanged', async () => {
    const CustomAvatar = <img alt="custom avatar" />;

    render(await FrogBotNav({ ...props(), CustomAvatar }));

    expect(navClient.mock.calls[0]?.[0].CustomAvatar).toBe(CustomAvatar);
  });

  it('creates no account icon on the server', async () => {
    render(await FrogBotNav(props()));

    expect(navClient.mock.calls[0]?.[0]).not.toHaveProperty('accountIcon');
    expect(navClient.mock.calls[0]?.[0].CustomAvatar).toBeUndefined();
  });

  it('passes visible entities to configured navigation sections', async () => {
    render(await FrogBotNav(props()));

    expect(screen.getByText('posts, chats')).not.toBeNull();
  });

  it('renders no New Chat item when navItems is unset', async () => {
    render(await FrogBotNav(props()));

    expect(navClient.mock.calls[0]?.[0].items).toEqual([]);
  });

  it('passes collectionSlug and docID to its slots', async () => {
    const base = props();
    const navProps = {
      ...base,
      payload: { ...base.payload, importMap: { [sectionPath]: PageSection } },
    } as unknown as ServerProps;

    render(await FrogBotNav({ ...navProps, collectionSlug: 'posts', docID: 7 }));

    expect(screen.getByTestId('page-section').textContent).toBe('posts/7');
  });

  it('calls a navItems function once and gives its items to the rail and the palette', async () => {
    const navItems = vi.fn(
      ({
        collectionSlug,
        docID,
        req,
      }: {
        collectionSlug?: string;
        docID?: number;
        req?: unknown;
      }) => [
        {
          icon: navIconPath,
          label: (req as { frogbot?: unknown }).frogbot ? 'Versions' : 'missing req.frogbot',
          path: `/admin/collections/${collectionSlug}/${docID}/versions`,
        },
      ],
    );

    const base = navItemProps([]);
    const config = base.payload.config as unknown as { admin: { components: object } };

    config.admin.components = { navItems };

    render(await FrogBotNav({ ...base, collectionSlug: 'posts', docID: 7, viewType: 'document' }));

    const { items, palette } = navClient.mock.calls[0]?.[0] as {
      items: { label: string; path: string }[];
      palette: { rows: unknown[] };
    };

    const versions = { label: 'Versions', path: '/admin/collections/posts/7/versions' };

    expect(navItems).toHaveBeenCalledOnce();
    expect(navItems.mock.calls[0]?.[0]).toMatchObject({
      collectionSlug: 'posts',
      docID: 7,
      viewType: 'document',
    });
    expect(items).toEqual([expect.objectContaining(versions)]);
    expect(palette.rows).toEqual([{ group: null, ...versions }]);
    expect(render(renderedItemIcon(0)).getByTestId('nav-icon')).not.toBeNull();
  });

  it('renders a built-in nav item icon from the icon registry', async () => {
    render(await FrogBotNav(navItemProps([{ icon: 'home', label: 'Home', path: '/home' }])));

    expect(renderToStaticMarkup(renderedItemIcon(0))).toBe(
      renderToStaticMarkup(<HomeIcon className="fb-app-sidebar__icon" size={24} />),
    );
  });

  it('renders a component nav item icon through the import map', async () => {
    render(await FrogBotNav(navItemProps([{ icon: navIconPath, label: 'Custom', path: '/c' }])));

    const { getByTestId } = render(renderedItemIcon(0));

    expect(getByTestId('nav-icon').getAttribute('class')).toBe('fb-app-sidebar__icon');
    expect(getByTestId('nav-icon').dataset.size).toBe('24');
  });

  it('renders a component object nav item icon through the import map', async () => {
    const icon = { exportName: 'NavIcon', path: './NavIcon' };

    render(await FrogBotNav(navItemProps([{ icon, label: 'Object', path: '/o' }])));

    const { getByTestId } = render(renderedItemIcon(0));

    expect(getByTestId('nav-icon').getAttribute('class')).toBe('fb-app-sidebar__icon');
  });

  it('leaves an empty nav item icon to the sidebar fallback', async () => {
    render(await FrogBotNav(navItemProps([{ icon: '', label: 'Empty', path: '/e' }])));

    const items = navClient.mock.calls[0]?.[0].items as { icon?: ReactNode }[] | undefined;

    expect(items?.[0]).toMatchObject({ label: 'Empty' });
    expect(items?.[0]?.icon).toBeUndefined();
  });

  it('renders the default Collections section with links and icons', async () => {
    render(await FrogBotNav(defaultSectionProps()));

    const posts = await screen.findByRole('link', { name: 'Posts' });
    const chats = screen.getByRole('link', { name: 'Chats' });

    expect(posts.getAttribute('href')).toBe('/admin/collections/posts');
    expect(chats.getAttribute('href')).toBe('/admin/collections/chats');
    expect(posts.querySelector('svg')).not.toBeNull();
    expect(chats.querySelector('svg')).not.toBeNull();
  });

  it('omits collections the user cannot read from the default Collections section', async () => {
    const defaults = defaultSectionProps({
      collections: { chats: { read: true }, posts: { read: false } },
      globals: {},
    });

    render(await FrogBotNav(defaults));

    await screen.findByRole('link', { name: 'Chats' });

    expect(screen.queryByRole('link', { name: 'Posts' })).toBeNull();
    expect(navClient.mock.calls[0]?.[0].items).toEqual([]);
  });

  it('passes the command palette model for the collections the user can read', async () => {
    render(
      await FrogBotNav(
        defaultSectionProps({
          collections: { chats: { read: true }, posts: { read: false } },
          globals: {},
        }),
      ),
    );

    expect(navClient.mock.calls[0]?.[0].palette).toEqual({
      collections: [{ label: 'Chats', searchFields: ['id'], slug: 'chats', titleField: 'id' }],
      rows: [{ group: 'general:collections', label: 'Chats', path: '/admin/collections/chats' }],
    });
  });
});
