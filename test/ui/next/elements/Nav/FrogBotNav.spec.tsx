import { HomeIcon } from '@frogbotai/ui/icons';
import { render, screen } from '@testing-library/react';
import type { PayloadRequest, ServerProps } from 'payload';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CollectionsSection } from '../../../../../packages/next/src/elements/Nav/CollectionsSection';
import { FrogBotNav } from '../../../../../packages/next/src/elements/Nav/index';

type NavClientProps = {
  afterAccountMenu?: ReactNode;
  beforeAccountMenu?: ReactNode;
  items?: unknown[];
  logout?: ReactNode;
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

vi.mock('frogbot/internal', () => ({ attachRegisteredFrogBot }));

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

vi.mock('../../../../../packages/next/src/elements/Nav/index.client', () => ({
  FrogBotNavClient: navClient,
}));

const sectionPath = './NavSection#VisibleEntitiesSection';
const collectionsSectionPath = '@frogbotai/next#CollectionsSection';
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

function accountMenuProps({ withReq = true } = {}) {
  const base = props();

  return {
    ...base,
    payload: {
      ...base.payload,
      config: {
        ...base.payload.config,
        admin: {
          ...base.payload.config.admin,
          components: {
            afterAccountMenu: [afterAccountPath],
            beforeAccountMenu: [beforeAccountPath],
            logout: { Button: logoutPath },
            settingsMenu: [settingsMenuPath],
          },
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

function defaultSectionProps() {
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
    permissions: {
      collections: { chats: { read: true }, posts: { read: true } },
      globals: {},
    },
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
    const base = accountMenuProps();
    const navProps = {
      ...base,
      payload: {
        ...base.payload,
        config: {
          ...base.payload.config,
          admin: {
            ...base.payload.config.admin,
            components: { afterAccountMenu: [afterAccountPath], beforeAccountMenu: [] },
          },
        },
      },
    } as typeof base;

    render(await FrogBotNav(navProps));

    const { afterAccountMenu, beforeAccountMenu, logout } = navClient.mock.calls[0][0];

    expect(render(<>{beforeAccountMenu}</>).container.innerHTML).toBe('');
    expect(render(<>{afterAccountMenu}</>).container.textContent).toBe('attached');
    expect(logout).toBeUndefined();
  });

  it('passes visible entities to configured navigation sections', async () => {
    render(await FrogBotNav(props()));

    expect(screen.getByText('posts, chats')).not.toBeNull();
  });

  it('renders no New Chat item when navItems is unset', async () => {
    render(await FrogBotNav(props()));

    expect(navClient.mock.calls[0]?.[0].items).toEqual([]);
  });

  it('renders a built-in nav item icon from the icon registry', async () => {
    render(await FrogBotNav(navItemProps([{ icon: 'home', label: 'Home', path: '/home' }])));

    expect(renderToStaticMarkup(renderedItemIcon(0))).toBe(
      renderToStaticMarkup(<HomeIcon className="frogbot-admin-sidebar__icon" size={24} />),
    );
  });

  it('renders a component nav item icon through the import map', async () => {
    render(await FrogBotNav(navItemProps([{ icon: navIconPath, label: 'Custom', path: '/c' }])));

    const { getByTestId } = render(renderedItemIcon(0));

    expect(getByTestId('nav-icon').getAttribute('class')).toBe('frogbot-admin-sidebar__icon');
    expect(getByTestId('nav-icon').dataset.size).toBe('24');
  });

  it('renders a component object nav item icon through the import map', async () => {
    const icon = { exportName: 'NavIcon', path: './NavIcon' };

    render(await FrogBotNav(navItemProps([{ icon, label: 'Object', path: '/o' }])));

    const { getByTestId } = render(renderedItemIcon(0));

    expect(getByTestId('nav-icon').getAttribute('class')).toBe('frogbot-admin-sidebar__icon');
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
    const defaults = defaultSectionProps();

    defaults.permissions = {
      collections: { chats: { read: true }, posts: { read: false } },
      globals: {},
    };

    render(await FrogBotNav(defaults));

    await screen.findByRole('link', { name: 'Chats' });

    expect(screen.queryByRole('link', { name: 'Posts' })).toBeNull();
    expect(navClient.mock.calls[0]?.[0].items).toEqual([]);
  });
});
