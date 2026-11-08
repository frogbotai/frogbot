import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  Client: vi.fn((_props: Record<string, unknown>) => null),
}));

vi.mock('../../../../../packages/ui/src/admin/views/collectionViews.js', () => ({
  getActiveViewSlug: () => 'board',
  getRuntimeViews: () => [],
  redirectToLastView: vi.fn(),
}));

vi.mock('../../../../../packages/ui/src/admin/views/frame.js', () => ({
  buildFrameSlots: () => ({}),
}));

vi.mock('../../../../../packages/ui/src/admin/views/CollectionViewShell.client.js', () => ({
  CollectionViewShellClient: mocks.Client,
}));

const { CollectionViewShell } =
  await import('../../../../../packages/ui/src/admin/views/CollectionViewShell.js');

function shellProps(count: () => Promise<unknown>) {
  return {
    children: null,
    clientConfig: { routes: { admin: '/admin' } },
    collectionConfig: { slug: 'tasks' },
    collectionSlug: 'tasks',
    importMap: {},
    initPageResult: {
      permissions: { collections: { tasks: { create: true, delete: true } } },
      req: {
        i18n: {},
        payload: { count: vi.fn(count) },
        query: { where: { nonexistentField: { equals: 'x' } } },
      },
    },
    server: {},
    view: { slug: 'board', type: 'board' },
    views: [],
  };
}

describe('CollectionViewShell', () => {
  it('renders an empty view when the database refuses the filters, as the list does', async () => {
    const refused = Object.assign(new Error('The following path cannot be queried'), {
      name: 'QueryError',
    });

    render(await CollectionViewShell(shellProps(() => Promise.reject(refused)) as never));

    expect(mocks.Client.mock.lastCall?.[0]).toMatchObject({ isEmpty: true });
  });

  it('still fails on other errors', async () => {
    await expect(
      CollectionViewShell(shellProps(() => Promise.reject(new Error('database down'))) as never),
    ).rejects.toThrow('database down');
  });
});
