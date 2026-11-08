import type { FrogBotRequest } from 'frogbot';
import type { SanitizedConfig, ServerProps } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { buildSettingsNav } from '../../../../../../packages/ui/src/admin/elements/SettingsNav/buildSettingsNav';
import { getActiveSettingsHref } from '../../../../../../packages/ui/src/admin/elements/SettingsNav/index.client';

const settingsView = { Component: '@frogbotai/ui/admin/rsc#SettingsView' };

type ConfigOptions = {
  adminRoute?: string;
  collections?: Array<Record<string, unknown>>;
  settings?: Array<Record<string, unknown>>;
  views?: Record<string, unknown>;
};

function makeConfig({
  adminRoute = '/admin',
  collections = [],
  settings = [],
  views = { settings: settingsView },
}: ConfigOptions = {}): SanitizedConfig {
  return {
    admin: { components: { views }, routes: { account: '/account' }, settings },
    collections,
    routes: { admin: adminRoute },
  } as unknown as SanitizedConfig;
}

function permissionsFor(read: Record<string, boolean>): NonNullable<ServerProps['permissions']> {
  return {
    collections: Object.fromEntries(
      Object.entries(read).map(([slug, value]) => [slug, { read: value }]),
    ),
    globals: {},
  } as unknown as NonNullable<ServerProps['permissions']>;
}

const req = {
  i18n: { language: 'en', t: (key: string) => key },
  user: { id: 'user-1' },
} as unknown as FrogBotRequest;

const users = {
  admin: { group: false, icon: 'people', settings: true },
  labels: { plural: 'Users' },
  slug: 'users',
};

const apiKeys = { admin: { settings: true }, labels: { plural: 'API keys' }, slug: 'api-keys' };
const posts = { admin: {}, labels: { plural: 'Posts' }, slug: 'posts' };

describe('buildSettingsNav', () => {
  it('orders Collections, Settings collections in config order, then accessible entries', async () => {
    const denied = vi.fn(() => false);

    const model = await buildSettingsNav({
      config: makeConfig({
        collections: [posts, users, apiKeys],
        settings: [
          { Component: 'Usage', icon: 'robot', label: 'Usage', path: 'workspace/usage' },
          { access: denied, Component: 'Secret', label: 'Secret', path: 'secret' },
        ],
      }),
      permissions: permissionsFor({ 'api-keys': true, posts: true, users: true }),
      req,
      visibleEntities: { collections: ['posts', 'users', 'api-keys'], globals: [] },
    });

    expect(denied).toHaveBeenCalledWith({ req });
    expect(model).toEqual({
      accountHref: '/admin/account',
      backHref: '/admin',
      items: [
        { href: '/admin/settings/collections', kind: 'collections', label: 'Collections' },
        { href: '/admin/collections/users', icon: 'people', kind: 'collection', label: 'Users' },
        {
          href: '/admin/collections/api-keys',
          icon: undefined,
          kind: 'collection',
          label: 'API keys',
        },
        { href: '/admin/settings/workspace/usage', icon: 'robot', kind: 'entry', label: 'Usage' },
      ],
    });
  });

  it('leaves out Settings collections the user cannot read and admin.hidden ones', async () => {
    const model = await buildSettingsNav({
      config: makeConfig({ collections: [users, apiKeys] }),
      permissions: permissionsFor({ 'api-keys': true, users: false }),
      req,
      visibleEntities: { collections: ['users'], globals: [] },
    });

    expect(model.items.map(({ href }) => href)).toEqual(['/admin/settings/collections']);
  });

  it('has no Settings collections when the app replaces the Settings view', async () => {
    const model = await buildSettingsNav({
      config: makeConfig({
        collections: [users],
        views: { settings: { Component: './Mine#Mine' } },
      }),
      permissions: permissionsFor({ users: true }),
      req,
      visibleEntities: { collections: ['users'], globals: [] },
    });

    expect(model.items.map(({ kind }) => kind)).toEqual(['collections']);
  });

  it.each([
    ['root', '/', '/settings/collections', '/account', '/'],
    ['custom', '/control', '/control/settings/collections', '/control/account', '/control'],
  ])(
    'formats the %s admin route without a protocol-relative URL',
    async (_, adminRoute, collections, account, back) => {
      const model = await buildSettingsNav({
        config: makeConfig({ adminRoute }),
        permissions: permissionsFor({}),
        req,
        visibleEntities: { collections: [], globals: [] },
      });

      expect(model.items[0]?.href).toBe(collections);
      expect(model.accountHref).toBe(account);
      expect(model.backHref).toBe(back);
    },
  );
});

describe('getActiveSettingsHref', () => {
  const hrefs = [
    '/admin/settings/collections',
    '/admin/collections/users',
    '/admin/settings/billing',
    '/admin/settings/billing/invoices',
    '/admin/account',
  ];

  it.each([
    ['/admin/settings/collections', '/admin/settings/collections'],
    ['/admin/collections/users', '/admin/collections/users'],
    ['/admin/collections/users/42/versions', '/admin/collections/users'],
    ['/admin/settings/billing/invoices/7', '/admin/settings/billing/invoices'],
    ['/admin/settings/billing', '/admin/settings/billing'],
    ['/admin/account', '/admin/account'],
    ['/admin/collections/users-archive', undefined],
    ['/admin/collections/posts', undefined],
  ])('marks %s as %s', (pathname, active) => {
    expect(getActiveSettingsHref(pathname, hrefs)).toBe(active);
  });
});
