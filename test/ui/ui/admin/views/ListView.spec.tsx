import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createViewRequest: vi.fn(),
  DefaultListView: vi.fn((_props: Record<string, unknown>) => null),
}));

vi.mock('../../../../../packages/ui/src/admin/views/List/DefaultListView.client.js', () => ({
  DefaultListView: mocks.DefaultListView,
}));

vi.mock('../../../../../packages/ui/src/admin/views/collectionViews.js', () => ({
  createViewRequest: mocks.createViewRequest,
  getRuntimeViews: () => [],
  redirectToLastView: vi.fn(),
  resolveCollectionViews: vi.fn(),
}));

const { ListView } = await import('../../../../../packages/ui/src/admin/views/List/ListView.js');

const serverKeys = [
  'collectionConfig',
  'data',
  'i18n',
  'limit',
  'listSearchableFields',
  'locale',
  'params',
  'payload',
  'permissions',
  'searchParams',
  'server',
  'user',
];

function listProps(overrides: Record<string, unknown> = {}) {
  return {
    collectionConfig: { admin: { components: {} }, slug: 'posts' },
    collectionSlug: 'posts',
    data: { docs: [] },
    hasCreatePermission: true,
    i18n: { t: (key: string) => key },
    limit: 10,
    listPreferences: { columns: [] },
    listSearchableFields: [],
    locale: undefined,
    newDocumentURL: '/admin/collections/posts/create',
    params: undefined,
    payload: { config: { routes: { admin: '/admin' } }, importMap: {} },
    permissions: {},
    searchParams: {},
    server: {},
    user: { id: 'u1' },
    viewType: 'list',
    ...overrides,
  };
}

describe('ListView', () => {
  it("keeps Payload's list in a relationship drawer, with no server props", async () => {
    render(await ListView(listProps() as never));

    const received = mocks.DefaultListView.mock.lastCall?.[0];

    for (const key of serverKeys) expect(received).not.toHaveProperty(key);

    expect(received?.listPreferences).toEqual({ columns: [] });
    expect(mocks.createViewRequest).not.toHaveBeenCalled();
  });

  it("keeps Payload's hierarchy list on the collection page", async () => {
    mocks.DefaultListView.mockClear();

    render(
      await ListView(
        listProps({
          params: { segments: ['collections', 'posts'] },
          viewType: 'hierarchy',
        }) as never,
      ),
    );

    expect(mocks.DefaultListView.mock.lastCall?.[0]).toMatchObject({ viewType: 'hierarchy' });
    expect(mocks.createViewRequest).not.toHaveBeenCalled();
  });
});
