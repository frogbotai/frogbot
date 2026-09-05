import { describe, expect, it } from 'vitest';

import { COLLECTION_VIEWS } from '../../../../packages/frogbot/src/admin/views/registry.js';
import { compileCollectionViews } from '../../../../packages/frogbot/src/config/collectionViews.js';
import { getCustomCollectionViewByRoute } from '../../../../packages/next/node_modules/@payloadcms/next/dist/views/Root/getCustomCollectionViewByRoute.js';

const registry = [
  ...COLLECTION_VIEWS,
  { key: 'stub', label: 'Stub', path: '/stub', Component: './Stub#StubView' },
];

describe('collection view route contract', () => {
  it('compiles an injected view into Payload routing with its viewType key', () => {
    const admin = compileCollectionViews({
      collection: { slug: 'posts', fields: [], admin: { stub: true } as never },
      registry,
    });

    const result = getCustomCollectionViewByRoute({
      adminRoute: '/admin',
      baseRoute: '/collections/posts',
      currentRoute: '/admin/collections/posts/stub',
      views: admin?.components?.views as never,
    });

    expect(result.viewKey).toBe('stub');
    expect(result.view).toEqual({ payloadComponent: './Stub#StubView' });
  });

  it('routes an explicit override and exposes its path to the switcher', () => {
    const override = { Component: './Custom#View', exact: true, path: '/custom' as const };
    const admin = compileCollectionViews({
      collection: {
        slug: 'posts',
        fields: [],
        admin: { components: { views: { stub: override } }, stub: true } as never,
      },
      registry,
    }) as never as Record<string, any>;

    const result = getCustomCollectionViewByRoute({
      adminRoute: '/admin',
      baseRoute: '/collections/posts',
      currentRoute: '/admin/collections/posts/custom',
      views: admin.components.views,
    });

    expect(result.viewKey).toBe('stub');
    expect(result.view).toEqual({ payloadComponent: './Custom#View' });
    expect(admin.custom.frogbot.views[1].path).toBe('/custom');
  });

  it('does not ship the test-only view', () => {
    expect(COLLECTION_VIEWS).toEqual([{ key: 'list', label: 'List', path: '' }]);
  });
});
