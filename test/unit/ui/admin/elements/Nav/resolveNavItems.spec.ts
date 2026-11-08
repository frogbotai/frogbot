import type { NavItemsArgs } from 'frogbot';
import type { ImportMap, SanitizedConfig, ServerProps } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { validateAdminIcon } from '../../../../../../packages/frogbot/src/admin/icons';
import { buildPaletteModel } from '../../../../../../packages/ui/src/admin/elements/CommandPalette/buildPaletteModel';
import { buildNavModel } from '../../../../../../packages/ui/src/admin/elements/Nav/buildNavModel';
import { resolveNavItems } from '../../../../../../packages/ui/src/admin/elements/Nav/resolveNavItems';

const i18n = { language: 'en', t: (key: string) => key } as ServerProps['i18n'];
const permissions = { collections: {}, globals: {} } as unknown as NonNullable<
  ServerProps['permissions']
>;

const visibleEntities = { collections: [], globals: [] };
const importMap = { './Icon#Icon': () => null } as unknown as ImportMap;

function config(navItems: unknown): SanitizedConfig {
  return {
    admin: { components: { navItems } },
    collections: [],
    globals: [],
    routes: { admin: '/admin' },
  } as unknown as SanitizedConfig;
}

describe('resolveNavItems', () => {
  it('passes the page to a navItems function and feeds its items to the rail and the palette', async () => {
    const navItems = vi.fn(({ collectionSlug, docID }: NavItemsArgs) => [
      { label: 'Versions', path: `/admin/collections/${collectionSlug}/${docID}/versions` },
    ]);

    const built = config(navItems);
    const params = { segments: ['collections', 'posts', '7'] };

    const items = await resolveNavItems({
      collectionSlug: 'posts',
      config: built,
      docID: 7,
      importMap,
      params,
      viewType: 'document',
    });

    expect(navItems).toHaveBeenCalledOnce();
    expect(navItems).toHaveBeenCalledWith({
      collectionSlug: 'posts',
      docID: 7,
      params,
      viewType: 'document',
    });

    const modelProps = { config: built, i18n, navItems: items, permissions, visibleEntities };
    const versions = { label: 'Versions', path: '/admin/collections/posts/7/versions' };

    expect(buildNavModel(modelProps).items).toEqual([versions]);
    expect(buildPaletteModel(modelProps).rows).toContainEqual(
      expect.objectContaining({ group: null, ...versions }),
    );
    expect(navItems).toHaveBeenCalledOnce();
  });

  it('awaits an async navItems function', async () => {
    const items = await resolveNavItems({
      config: config(() => Promise.resolve([{ icon: 'home', label: 'Home', path: '/admin' }])),
      importMap,
    });

    expect(items).toEqual([{ icon: 'home', label: 'Home', path: '/admin' }]);
  });

  it('returns a static array unchanged, and buildNavModel still reads it without resolving', async () => {
    const navItems = [{ icon: './Unmapped#Icon', label: 'Home', path: '/admin' }];
    const built = config(navItems);

    expect(await resolveNavItems({ config: built, importMap })).toBe(navItems);
    expect(buildNavModel({ config: built, i18n, permissions, visibleEntities }).items).toEqual(
      navItems,
    );
  });

  it('accepts built-in icon names and import-mapped component paths', async () => {
    const navItems = [
      { icon: 'robot', label: 'Robot', path: '/robot' },
      { icon: './Icon#Icon', label: 'String', path: '/string' },
      { icon: { exportName: 'Icon', path: './Icon' }, label: 'Object', path: '/object' },
      { label: 'None', path: '/none' },
    ];

    expect(await resolveNavItems({ config: config(() => navItems), importMap })).toEqual(navItems);
  });

  it.each([
    ['a missing label', { path: '/a' }, 'index 0: it needs a label.'],
    ['a missing path', { label: 'A' }, "index 0 ('A'): it needs a path."],
    [
      'an unknown icon name',
      { icon: 'hmoe', label: 'A', path: '/a' },
      `index 0 ('A'): icon "hmoe" is neither a built-in icon name nor a component path in the import map.`,
    ],
    [
      'an icon name inherited from Object',
      { icon: 'constructor', label: 'A', path: '/a' },
      `icon "constructor" is neither`,
    ],
    [
      'an unmapped component path',
      { icon: './Missing#Icon', label: 'A', path: '/a' },
      `icon "./Missing#Icon" is neither`,
    ],
  ])('throws on %s', async (_, item, message) => {
    await expect(resolveNavItems({ config: config(() => [item]), importMap })).rejects.toThrow(
      message,
    );
  });

  it.each(['brand-google', 'brand-git-hub', 'brand-slack'])(
    'rejects the brand icon %s, as sanitize does for a static array',
    async (icon) => {
      expect(() => validateAdminIcon(icon)).toThrow(/brand logo/);
      await expect(
        resolveNavItems({ config: config(() => [{ icon, label: 'B', path: '/b' }]), importMap }),
      ).rejects.toThrow(`icon "${icon}" is neither`);
    },
  );

  it('accepts a @payloadcms/ui icon whose rewritten key is in the import map', async () => {
    const rewrittenMap = { '@frogbotai/ui/admin#FolderIcon': () => null } as unknown as ImportMap;

    await expect(
      resolveNavItems({
        config: config(() => [{ icon: '@payloadcms/ui#FolderIcon', label: 'A', path: '/a' }]),
        importMap: rewrittenMap,
      }),
    ).resolves.toEqual([{ icon: '@frogbotai/ui/admin#FolderIcon', label: 'A', path: '/a' }]);
  });

  it('throws when the function does not return an array', async () => {
    await expect(resolveNavItems({ config: config(() => null), importMap })).rejects.toThrow(
      '[frogbot] admin.components.navItems must return an array of nav items.',
    );
  });

  it('lets an error from the function surface', async () => {
    const error = new Error('boom');

    await expect(
      resolveNavItems({
        config: config(() => {
          throw error;
        }),
        importMap,
      }),
    ).rejects.toBe(error);
  });
});
