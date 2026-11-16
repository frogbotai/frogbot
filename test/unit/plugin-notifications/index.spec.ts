import type { CollectionConfig, FrogBotConfig } from 'frogbot';
import { describe, expect, it } from 'vitest';

import {
  type NotificationsConfig,
  notificationsPlugin,
  notify,
} from '../../../packages/plugins/plugin-notifications/src/index.js';
import { adminPath, badge } from '../../../packages/plugins/plugin-notifications/src/shared.js';

function config(collections: CollectionConfig[] = [], admin: FrogBotConfig['admin'] = {}) {
  return {
    secret: 'test',
    db: {} as FrogBotConfig['db'],
    admin,
    collections: [{ slug: 'users', auth: true, fields: [] }, ...collections],
  } satisfies FrogBotConfig;
}

async function apply(base: FrogBotConfig, options: Parameters<typeof notificationsPlugin>[0] = {}) {
  const result = await notificationsPlugin(options)(base);
  const custom = result.custom?.['plugin-notifications'] as NotificationsConfig;
  const collection = result.collections.find(({ slug }) => slug === custom.slug);

  return { collection, custom, result };
}

describe('notificationsPlugin', () => {
  it('adds the collection, the bell after existing actions, the inbox view and notify()', async () => {
    const { collection, custom, result } = await apply(
      config([], { components: { actions: ['./Mine#Action'] } }),
    );

    expect(collection?.fields.map((field) => ('name' in field ? field.name : ''))).toEqual([
      'user',
      'actor',
      'kind',
      'title',
      'excerpt',
      'link',
      'source',
      'readAt',
      'createdAt',
    ]);
    expect(custom).toEqual({ notify, slug: 'notifications', userSlug: 'users' });
    expect(result.admin?.components?.actions).toEqual([
      './Mine#Action',
      '@frogbotai/plugin-notifications/rsc#NotificationsBell',
    ]);
    expect(result.admin?.components?.views?.notifications).toMatchObject({
      Component: '@frogbotai/plugin-notifications/rsc#InboxView',
      path: '/notifications',
    });
  });

  it('takes overrides, keeps the built-in fields available, and refuses a taken slug', async () => {
    const { collection, custom } = await apply(config(), {
      overrides: {
        slug: 'alerts',
        fields: ({ defaultFields }) => [...defaultFields, { name: 'archivedAt', type: 'date' }],
      },
    });

    expect(custom.slug).toBe('alerts');
    expect(collection?.fields.at(-1)).toMatchObject({ name: 'archivedAt' });
    await expect(apply(config([{ slug: 'notifications', fields: [] }]))).rejects.toThrow(
      /already exists/,
    );
    expect(() => notificationsPlugin({ overrides: { slug: '' } })).toThrow(/cannot be empty/);
  });

  it('leaves the bell out with bell: false, and keeps the inbox', async () => {
    const { result } = await apply(config(), { bell: false });

    expect(result.admin?.components?.actions ?? []).toEqual([]);
    expect(result.admin?.components?.views?.notifications).toBeDefined();
  });

  it('picks admin.user with several auth collections, and asks for it otherwise', async () => {
    const customers: CollectionConfig = { slug: 'customers', auth: true, fields: [] };

    expect((await apply(config([customers], { user: 'users' }))).custom.userSlug).toBe('users');
    await expect(apply(config([customers]))).rejects.toThrow(/Set admin.user/);
  });

  it('lets a user read, mark and delete only their own rows, and nobody create one', async () => {
    const { collection } = await apply(config());
    const access = collection!.access!;
    const req = (user: unknown) => ({ req: { user } }) as never;

    expect(await access.read!(req({ collection: 'users', id: 4 }))).toEqual({
      user: { equals: 4 },
    });
    expect(await access.update!(req({ collection: 'users', id: 4 }))).toEqual({
      user: { equals: 4 },
    });
    expect(await access.read!(req({ collection: 'customers', id: 4 }))).toBe(false);
    expect(await access.delete!(req(null))).toBe(false);
    expect(await access.create!(req({ collection: 'users', id: 4 }))).toBe(false);
  });
});

describe('notify()', () => {
  it('explains how to install the plugin when it is missing', async () => {
    const req = { payload: { config: { custom: {} } } } as never;

    await expect(notify(req, { title: 'Hi', user: 1 })).rejects.toThrow(/notificationsPlugin\(\)/);
  });
});

describe('shared', () => {
  it('caps the badge and joins admin paths', () => {
    expect([badge(1), badge(99), badge(100)]).toEqual(['1', '99', '99+']);
    expect(adminPath('/admin', '/notifications')).toBe('/admin/notifications');
    expect(adminPath('/admin/', '/notifications')).toBe('/admin/notifications');
    expect(adminPath('/', '/notifications')).toBe('/notifications');
  });
});
