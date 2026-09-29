import { render, screen } from '@testing-library/react';
import type { PayloadRequest, ServerProps } from 'payload';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CollectionsSection } from '../../../../../packages/next/src/elements/Nav/CollectionsSection';
import { FrogBotNav } from '../../../../../packages/next/src/elements/Nav/index';

const navClient = vi.hoisted(() =>
  vi.fn(({ sections }: { items?: unknown[]; sections?: ReactNode }) => <nav>{sections}</nav>),
);

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

function VisibleEntitiesSection({ visibleEntities }: ServerProps) {
  return <p>{visibleEntities?.collections.join(', ')}</p>;
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
            admin: { group: 'Chat', icon: 'bubble-chat' },
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
  });

  it('passes visible entities to configured navigation sections', async () => {
    render(await FrogBotNav(props()));

    expect(screen.getByText('posts, chats')).not.toBeNull();
  });

  it('renders no New Chat item when navItems is unset', async () => {
    render(await FrogBotNav(props()));

    expect(navClient.mock.calls[0]?.[0].items).toEqual([]);
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
    } as unknown as ServerProps['permissions'];

    render(await FrogBotNav(defaults));

    await screen.findByRole('link', { name: 'Chats' });

    expect(screen.queryByRole('link', { name: 'Posts' })).toBeNull();
    expect(navClient.mock.calls[0]?.[0].items).toEqual([]);
  });
});
