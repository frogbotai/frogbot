import type { SanitizedConfig, ServerProps } from 'payload';
import { describe, expect, it } from 'vitest';

import { buildNavModel } from './buildNavModel';

const i18n = {
  language: 'en',
  t: (key: string) => ({
    'general:collections': 'Collections',
    'general:globals': 'Globals',
  })[key] ?? key,
} as ServerProps['i18n'];

const permissions = {
  collections: {
    hidden: { read: true },
    posts: { read: true },
    users: { read: true },
  },
  globals: {},
} as unknown as NonNullable<ServerProps['permissions']>;

function config(): SanitizedConfig {
  return {
    admin: { nav: { items: [{ label: 'Home', path: '/admin' }] } },
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
    ],
    globals: [],
    routes: { admin: '/control' },
  } as unknown as SanitizedConfig;
}

describe('buildNavModel', () => {
  it('builds configured items and translated entity groups in config order', () => {
    expect(
      buildNavModel({
        config: config(),
        i18n,
        permissions,
        visibleEntities: { collections: ['posts', 'users', 'hidden'], globals: [] },
      }),
    ).toEqual({
      groups: [
        { items: [{ label: 'Posts', path: '/control/collections/posts' }], label: 'Collections' },
        { items: [{ label: 'Users', path: '/control/collections/users' }], label: 'Accounts' },
      ],
      items: [{ label: 'Home', path: '/admin' }],
    });
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
