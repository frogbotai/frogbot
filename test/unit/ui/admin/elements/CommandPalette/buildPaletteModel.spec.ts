import type { SanitizedConfig, ServerProps } from 'payload';
import { describe, expect, it } from 'vitest';

import {
  buildPaletteModel,
  getReadGuardedPaths,
} from '../../../../../../packages/ui/src/admin/elements/CommandPalette/buildPaletteModel';

const i18n = {
  language: 'en',
  t: (key: string) =>
    ({
      'general:collections': 'Collections',
      'general:globals': 'Globals',
    })[key] ?? key,
} as ServerProps['i18n'];

type Permission = { create?: boolean; read?: boolean };

function permissionsFor(
  collections: Record<string, Permission>,
): NonNullable<ServerProps['permissions']> {
  return { collections, globals: { settings: { read: true } } } as unknown as NonNullable<
    ServerProps['permissions']
  >;
}

const lexical = (...paths: string[]) => ({
  lexical: { fields: paths.map((path) => ({ localized: false, path })) },
});

function collection(slug: string, extra: Record<string, unknown> = {}) {
  const label = slug.charAt(0).toUpperCase() + slug.slice(1);

  return {
    admin: {},
    custom: {},
    fields: [],
    label,
    labels: { plural: label, singular: label },
    slug,
    ...extra,
  };
}

function config(): SanitizedConfig {
  return {
    admin: { components: { navItems: [{ label: 'Home', path: '/control' }] } },
    collections: [
      collection('posts', {
        admin: { useAsTitle: 'title', listSearchableFields: ['title', 'slug'] },
        custom: {
          frogbot: {
            search: {
              vectors: { name: 'vectors', vector: { path: 'embedding' } },
              content: { name: 'content', ...lexical('title', 'body') },
              other: { name: 'other', ...lexical('title') },
            },
          },
        },
      }),
      collection('users', { admin: { group: 'Accounts' } }),
      collection('projects', { admin: { group: null, useAsTitle: 'name' } }),
      collection('secrets'),
      collection('guarded', {
        custom: { frogbot: { search: { content: { name: 'content', ...lexical('meta.note') } } } },
        fields: [
          {
            access: { read: () => true },
            fields: [{ name: 'note', type: 'text' }],
            name: 'meta',
            type: 'group',
          },
        ],
      }),
      collection('hidden'),
    ],
    globals: [{ admin: {}, label: 'Settings', slug: 'settings' }],
    routes: { admin: '/control' },
  } as unknown as SanitizedConfig;
}

const permissions = permissionsFor({
  guarded: { read: true },
  hidden: { create: true, read: true },
  posts: { create: true, read: true },
  projects: { read: true },
  secrets: { create: true, read: false },
  users: { create: true, read: true },
});

const visibleEntities = {
  collections: ['posts', 'users', 'projects', 'secrets', 'guarded'],
  globals: ['settings'],
};

describe('buildPaletteModel', () => {
  const model = buildPaletteModel({ config: config(), i18n, permissions, visibleEntities });

  it('lists rows in sidebar order, with create paths only where the user can create', () => {
    expect(model.rows).toEqual([
      { group: null, label: 'Home', path: '/control' },
      { group: null, label: 'Projects', path: '/control/collections/projects' },
      {
        createPath: '/control/collections/posts/create',
        group: 'Collections',
        label: 'Posts',
        path: '/control/collections/posts',
      },
      { group: 'Collections', label: 'Guarded', path: '/control/collections/guarded' },
      { group: 'Globals', label: 'Settings', path: '/control/globals/settings' },
      {
        createPath: '/control/collections/users/create',
        group: 'Accounts',
        label: 'Users',
        path: '/control/collections/users',
      },
    ]);
  });

  it('keeps visible, readable collections in sidebar order with their title and index', () => {
    expect(model.collections).toEqual([
      { label: 'Projects', searchFields: ['name'], slug: 'projects', titleField: 'name' },
      {
        index: 'content',
        label: 'Posts',
        searchFields: ['title', 'slug'],
        slug: 'posts',
        titleField: 'title',
      },
      { label: 'Guarded', searchFields: ['id'], slug: 'guarded', titleField: 'id' },
      { label: 'Users', searchFields: ['id'], slug: 'users', titleField: 'id' },
    ]);
  });

  it('keeps the first navItem when it shares a collection path', () => {
    const withDuplicate = config();

    (withDuplicate.admin.components as { navItems: unknown[] }).navItems = [
      { label: 'All projects', path: '/control/collections/projects' },
    ];

    const result = buildPaletteModel({ config: withDuplicate, i18n, permissions, visibleEntities });

    expect(result.rows.filter(({ path }) => path === '/control/collections/projects')).toEqual([
      { group: null, label: 'All projects', path: '/control/collections/projects' },
    ]);

    expect(result.collections[0]?.slug).toBe('projects');
  });
});

describe('getReadGuardedPaths', () => {
  it('marks guarded fields, their descendants and fields under guarded tabs', () => {
    const guarded = getReadGuardedPaths([
      { access: { read: () => true }, name: 'secret', type: 'text' },
      { name: 'open', type: 'text' },
      {
        type: 'row',
        fields: [{ access: { read: () => true }, name: 'inRow', type: 'text' }],
      },
      {
        type: 'tabs',
        tabs: [
          {
            access: { read: () => true },
            fields: [{ name: 'body', type: 'text' }],
            name: 'details',
          },
          { fields: [{ name: 'summary', type: 'text' }], label: 'Unnamed' },
        ],
      },
    ] as never);

    expect([...guarded].sort()).toEqual(['details.body', 'inRow', 'secret']);
  });
});
