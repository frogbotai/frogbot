import { FolderIcon, RobotIcon, SettingIcon, TileIcon } from '@frogbotai/ui/icons';
import type * as frogbotInternalModule from 'frogbot/internal';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  FrogBotNavClient: vi.fn(() => null),
  FrogBotSettingsNavClient: vi.fn(() => null),
}));

vi.mock('@payloadcms/ui/elements/RenderServerComponent', () => ({
  RenderServerComponent: vi.fn(() => null),
}));

vi.mock('frogbot/internal', async (importOriginal) => ({
  ...(await importOriginal<typeof frogbotInternalModule>()),
  attachRegisteredFrogBot: (req: object) => req,
}));

vi.mock('../../../../../../packages/ui/src/admin/elements/Nav/index.client.js', () => mocks);

const { FrogBotNav, isSettingsPage } =
  await import('../../../../../../packages/ui/src/admin/elements/Nav/index.js');

const settingsView = { Component: '@frogbotai/ui/admin/rsc#SettingsView' };

function makeConfig(views: Record<string, unknown> = { settings: settingsView }) {
  return {
    admin: {
      components: { views },
      routes: { account: '/account', logout: '/logout' },
      settings: [
        { Component: 'Usage', icon: 'robot', label: 'Usage', path: 'usage' },
        { Component: 'Plain', label: 'Plain', path: 'plain' },
      ],
    },
    collections: [
      { admin: {}, labels: { plural: 'Posts' }, slug: 'posts' },
      { admin: { group: false, settings: true }, labels: { plural: 'Users' }, slug: 'users' },
    ],
    globals: [],
    routes: { admin: '/admin' },
  };
}

const i18n = { language: 'en', t: (key: string) => key };

function navProps(overrides: Record<string, unknown> = {}, config = makeConfig()) {
  return {
    i18n,
    params: { segments: [] },
    payload: { config, importMap: {} },
    permissions: { collections: { posts: { read: true }, users: { read: true } }, globals: {} },
    req: { i18n, user: { id: 'user-1' } },
    visibleEntities: { collections: ['posts', 'users'], globals: [] },
    ...overrides,
  } as never;
}

async function renderNav(props: never) {
  const element = (await FrogBotNav(props)) as ReactElement<Record<string, unknown>>;

  return { element, props: element.props };
}

describe('FrogBotNav', () => {
  beforeEach(() => {
    mocks.FrogBotNavClient.mockClear();
    mocks.FrogBotSettingsNavClient.mockClear();
  });

  it.each([
    ['a /settings page', { params: { segments: ['settings', 'collections'] } }],
    ['the account view', { viewType: 'account' }],
    ['a Settings collection list', { collectionSlug: 'users', viewType: 'list' }],
    ['a Settings collection document', { collectionSlug: 'users', viewType: 'document' }],
  ])('draws the Settings sidebar on %s', async (_, overrides) => {
    const { element } = await renderNav(navProps(overrides));

    expect(element.type).toBe(mocks.FrogBotSettingsNavClient);
  });

  it.each([
    ['the dashboard', { viewType: 'dashboard' }],
    ['an app collection', { collectionSlug: 'posts', viewType: 'list' }],
  ])('draws the main sidebar on %s', async (_, overrides) => {
    const { element } = await renderNav(navProps(overrides));

    expect(element.type).toBe(mocks.FrogBotNavClient);
  });

  it('keeps the main sidebar on Account and Settings collections when the app replaces the Settings view', async () => {
    const config = makeConfig({ settings: { Component: './Mine#Mine' } });

    for (const overrides of [
      { viewType: 'account' },
      { collectionSlug: 'users', viewType: 'list' },
    ]) {
      const { element } = await renderNav(navProps(overrides, config));

      expect(element.type).toBe(mocks.FrogBotNavClient);
    }
  });

  it('gives each Settings item its icon or a fallback, and the account and back links', async () => {
    const { props } = await renderNav(navProps({ viewType: 'account' }));
    const items = props.items as Array<{ href: string; icon: unknown; label: string }>;
    const html = (icon: unknown) => (isValidElement(icon) ? renderToStaticMarkup(icon) : icon);

    expect(props.accountHref).toBe('/admin/account');
    expect(props.backHref).toBe('/admin');
    expect(items.map(({ href, label }) => [label, href])).toEqual([
      ['Collections', '/admin/settings/collections'],
      ['Users', '/admin/collections/users'],
      ['Usage', '/admin/settings/usage'],
      ['Plain', '/admin/settings/plain'],
    ]);
    expect(items.map(({ icon }) => html(icon))).toEqual(
      [TileIcon, FolderIcon, RobotIcon, SettingIcon].map((Icon) =>
        renderToStaticMarkup(createElement(Icon, { size: 18 })),
      ),
    );
  });

  it('leaves out a Settings collection the user cannot read', async () => {
    const { props } = await renderNav(
      navProps({
        permissions: {
          collections: { posts: { read: true }, users: { read: false } },
          globals: {},
        },
        viewType: 'account',
      }),
    );

    expect((props.items as Array<{ label: string }>).map(({ label }) => label)).not.toContain(
      'Users',
    );
  });

  it('isSettingsPage reads a string segment as the first segment', () => {
    expect(
      isSettingsPage({ config: makeConfig() as never, params: { segments: 'settings' } }),
    ).toBe(true);
  });
});
