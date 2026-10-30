import type * as Payload from 'payload';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPayloadRequest: vi.fn(),
  getClientConfig: vi.fn(() => ({ client: true })),
  render: vi.fn(() => 'rendered'),
}));

vi.mock('@payloadcms/ui/utilities/getClientConfig', () => ({
  getClientConfig: mocks.getClientConfig,
}));

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof Payload>()),
  createPayloadRequest: mocks.createPayloadRequest,
}));

vi.mock('@payloadcms/ui/elements/RenderServerComponent', () => ({
  RenderServerComponent: mocks.render,
}));

vi.mock('../../../../../packages/ui/src/admin/views/CollectionViewShell.js', () => ({
  CollectionViewShell: () => null,
}));

const fail = (message: string) => () => {
  throw new Error(message);
};

const server = {
  forbidden: fail('forbidden'),
  getCookies: () => ({ get: () => undefined }),
  getHeaders: () => new Headers(),
  notFound: fail('not-found'),
  permanentRedirect: (path: string) => {
    throw new Error(`permanent redirect ${path}`);
  },
  redirect: (path: string) => {
    throw new Error(`redirect ${path}`);
  },
  setCookie: () => undefined,
  unauthorized: fail('unauthorized'),
};

const { CustomCollectionView: RenderCustomCollectionView } =
  await import('../../../../../packages/ui/src/admin/views/CustomCollectionView.js');

const CustomCollectionView = (props: Parameters<typeof RenderCustomCollectionView>[0]) =>
  RenderCustomCollectionView({ ...props, server });

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
  mocks.createPayloadRequest.mockReset();
  mocks.getClientConfig.mockClear();
  mocks.render.mockClear();
});

describe('CustomCollectionView', () => {
  it('fills in page props when Payload renders it as the default list view', async () => {
    const req = { user: { id: 1 } };
    mocks.createPayloadRequest.mockResolvedValue(req);
    const payload = { config: { routes: {} }, importMap: { './View#View': () => null } };
    const i18n = { language: 'en' };
    const user = { id: 1 };

    expect(
      await CustomCollectionView({
        collectionConfig,
        i18n,
        payload,
        permissions: { collections: {} },
        searchParams: {
          page: '2',
          'where[or][0][title][equals]': 'Alpha',
          'where[or][1][status][in]': ['a', 'b'],
        },
        user,
        viewType: 'list',
      } as never),
    ).toBe('rendered');

    expect(mocks.createPayloadRequest).toHaveBeenCalledWith({
      payload,
      req: {
        i18n,
        query: {
          page: '2',
          where: { or: [{ title: { equals: 'Alpha' } }, { status: { in: ['a', 'b'] } }] },
        },
      },
      user,
    });
    expect(mocks.getClientConfig).toHaveBeenCalledWith({
      config: payload.config,
      i18n,
      importMap: payload.importMap,
      user,
    });
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({
        Component: './View#View',
        importMap: payload.importMap,
        serverProps: expect.objectContaining({
          clientConfig: { client: true },
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
      clientConfig: {},
      collectionConfig,
      importMap,
      initPageResult,
      payload: { importMap: { other: true } },
      viewType: 'list',
    } as never);

    expect(mocks.createPayloadRequest).not.toHaveBeenCalled();
    expect(mocks.getClientConfig).not.toHaveBeenCalled();
    expect(mocks.render).toHaveBeenCalledWith(
      expect.objectContaining({
        importMap,
        serverProps: expect.objectContaining({ initPageResult }),
      }),
    );
  });
});
