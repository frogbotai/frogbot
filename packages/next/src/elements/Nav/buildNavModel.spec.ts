import type { SanitizedConfig, ServerProps } from 'payload';
import { describe, expect, it } from 'vitest';

import { buildNavModel } from './buildNavModel';

const i18n = {
  language: 'en',
  t: (key: string) =>
    ({
      'general:collections': 'Collections',
      'general:globals': 'Globals',
    })[key] ?? key,
} as ServerProps['i18n'];

const permissions = {
  collections: {
    hidden: { read: true },
    posts: { read: true },
    users: { read: true },
    projects: { read: true },
  },
  globals: {},
} as unknown as NonNullable<ServerProps['permissions']>;

function config(): SanitizedConfig {
  return {
    admin: { components: { navItems: [{ label: 'Home', path: '/admin' }] } },
    collections: [
      { admin: {}, label: 'Posts', labels: { plural: 'Posts', singular: 'Post' }, slug: 'posts' },
      {
        admin: { group: 'Accounts' },
        label: { en: 'Members' },
        labels: { plural: 'Users', singular: 'User' },
        slug: 'users',
      },
      {
        admin: { group: false },
        label: 'Hidden',
        labels: { plural: 'Hidden', singular: 'Hidden' },
        slug: 'hidden',
      },
      {
        admin: { group: null, icon: 'robot' },
        label: 'Projects',
        labels: { plural: 'Projects', singular: 'Project' },
        slug: 'projects',
      },
    ],
    globals: [],
    routes: { admin: '/control' },
  } as unknown as SanitizedConfig;
}

function bareConfig(): SanitizedConfig {
  const bare = config();
  delete (bare.admin as { components?: unknown }).components;
  return bare;
}

describe('buildNavModel', () => {
  it('builds configured items and translated entity groups in config order', () => {
    expect(
      buildNavModel({
        config: config(),
        i18n,
        permissions,
        visibleEntities: { collections: ['posts', 'users', 'hidden', 'projects'], globals: [] },
      }),
    ).toEqual({
      groups: [
        { items: [{ label: 'Posts', path: '/control/collections/posts' }], label: 'Collections' },
        { items: [{ label: 'Users', path: '/control/collections/users' }], label: 'Accounts' },
      ],
      items: [
        { label: 'Home', path: '/admin' },
        { icon: 'robot', label: 'Projects', path: '/control/collections/projects' },
      ],
    });
  });

  it('defaults to the new chat item when navItems is unset', () => {
    const result = buildNavModel({
      config: bareConfig(),
      i18n,
      permissions,
      visibleEntities: { collections: [], globals: [] },
    });
    expect(result.items).toEqual([
      { icon: 'pencil-edit', label: 'New Chat', path: '/control/collections/chats/create' },
    ]);
  });

  it('drops the new chat default when navItems is configured', () => {
    const result = buildNavModel({
      config: config(),
      i18n,
      permissions,
      visibleEntities: { collections: [], globals: [] },
    });
    expect(result.items).toEqual([{ label: 'Home', path: '/admin' }]);
  });

  it('targets the resolved chat collection create route', () => {
    const result = buildNavModel({
      chatsSlug: 'conversations',
      config: bareConfig(),
      i18n,
      permissions,
      visibleEntities: { collections: [], globals: [] },
    });
    expect(result.items[0]?.path).toBe('/control/collections/conversations/create');
  });

  it('excludes entities without visibility or read permission', () => {
    const nextPermissions = structuredClone(permissions);
    nextPermissions.collections.users.read = false;
    const result = buildNavModel({
      config: config(),
      i18n,
      permissions: nextPermissions,
      visibleEntities: { collections: ['users'], globals: [] },
    });
    expect(result.groups).toEqual([]);
  });
});
