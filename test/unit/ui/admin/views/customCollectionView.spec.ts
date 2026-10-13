import type * as Payload from 'payload';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createLocalReq: vi.fn(),
  render: vi.fn(() => 'rendered'),
}));

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof Payload>()),
  createLocalReq: mocks.createLocalReq,
}));

vi.mock('@payloadcms/ui/elements/RenderServerComponent', () => ({
  RenderServerComponent: mocks.render,
}));

vi.mock('../../../../../packages/ui/src/admin/views/CollectionViewShell.js', () => ({
  CollectionViewShell: () => null,
}));

const { setServerAdapter } =
  await import('../../../../../packages/ui/src/admin/adapters/server.js');

setServerAdapter({
  notFound: () => {
    throw new Error('not-found');
  },
  redirect: (path) => {
    throw new Error(`redirect ${path}`);
  },
});

const { CustomCollectionView } =
  await import('../../../../../packages/ui/src/admin/views/CustomCollectionView.js');

const collectionConfig = {
  slug: 'connections',
  admin: { custom: { frogbot: { views: [{ label: 'Custom', path: '', slug: 'custom' }] } } },
  custom: {
    frogbot: {
      collectionViews: [{ type: 'custom', slug: 'custom', component: './View#View', shell: false }],
    },
  },
};

beforeEach(() => {
  mocks.createLocalReq.mockReset();
  mocks.render.mockClear();
});

describe('CustomCollectionView', () => {
  it('fills in page props when Payload renders it as the default list view', async () => {
    const req = { user: { id: 1 } };
    mocks.createLocalReq.mockResolvedValue(req);
    const payload = { importMap: { './View#View': () => null } };
    const i18n = { language: 'en' };
    const user = { id: 1 };

    expect(
      await CustomCollectionView({
        collectionConfig,
        i18n,
        payload,
        permissions: { collections: {} },
        searchParams: { page: '2' },
        user,
        viewType: 'list',
      } as never),
    ).toBe('rendered');

    expect(mocks.createLocalReq).toHaveBeenCalledWith(
      { req: { i18n, query: { page: '2' } }, user },
      payload,
    );
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({
        Component: './View#View',
        importMap: payload.importMap,
        serverProps: expect.objectContaining({
          importMap: payload.importMap,
          initPageResult: { collectionConfig, permissions: { collections: {} }, req },
        }),
      }),
    );
  });

  it('keeps the page props Payload already passed', async () => {
    const initPageResult = { req: { user: null } };
    const importMap = {};

    await CustomCollectionView({
      collectionConfig,
      importMap,
      initPageResult,
      payload: { importMap: { other: true } },
      viewType: 'list',
    } as never);

    expect(mocks.createLocalReq).not.toHaveBeenCalled();
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({
        importMap,
        serverProps: expect.objectContaining({ initPageResult }),
      }),
    );
  });
});
