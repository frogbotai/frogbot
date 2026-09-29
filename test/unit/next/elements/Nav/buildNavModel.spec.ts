import type { SanitizedConfig, ServerProps } from 'payload';
import { describe, expect, it } from 'vitest';

import {
  buildCollectionGroups,
  buildNavModel,
} from '../../../../../packages/next/src/elements/Nav/buildNavModel';

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
  it('builds configured items followed by ungrouped entities', () => {
    expect(
      buildNavModel({
        config: config(),
        i18n,
        permissions,
        visibleEntities: { collections: ['posts', 'users', 'hidden', 'projects'], globals: [] },
      }),
    ).toEqual({
      items: [
        { label: 'Home', path: '/admin' },
        { icon: 'robot', label: 'Projects', path: '/control/collections/projects' },
      ],
    });
  });

  it('returns no items when navItems is unset', () => {
    const result = buildNavModel({
      config: bareConfig(),
      i18n,
      permissions,
      visibleEntities: { collections: ['posts', 'users', 'hidden'], globals: [] },
    });

    expect(result.items).toEqual([]);
  });

  it('returns only configured items when no entity is ungrouped', () => {
    const result = buildNavModel({
      config: config(),
      i18n,
      permissions,
      visibleEntities: { collections: [], globals: [] },
    });

    expect(result.items).toEqual([{ label: 'Home', path: '/admin' }]);
  });
});

describe('buildCollectionGroups', () => {
  it('builds translated entity groups in config order', () => {
    const result = buildCollectionGroups({
      config: config(),
      i18n,
      permissions,
      visibleEntities: { collections: ['posts', 'users', 'hidden', 'projects'], globals: [] },
    });

    expect(result.groups).toEqual([
      { items: [{ label: 'Posts', path: '/control/collections/posts' }], label: 'Collections' },
      { items: [{ label: 'Users', path: '/control/collections/users' }], label: 'Accounts' },
    ]);
  });

  it('excludes entities without visibility or read permission', () => {
    const nextPermissions = structuredClone(permissions);

    nextPermissions.collections.users.read = false;

    const result = buildCollectionGroups({
      config: config(),
      i18n,
      permissions: nextPermissions,
      visibleEntities: { collections: ['users'], globals: [] },
    });

    expect(result.groups).toEqual([]);
  });
});
