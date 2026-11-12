import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  BoardView: vi.fn(() => Promise.resolve('board')),
  CalendarView: vi.fn(() => Promise.resolve('calendar')),
  CustomCollectionView: vi.fn(() => Promise.resolve('custom')),
  GalleryView: vi.fn(() => Promise.resolve('gallery')),
  TimelineView: vi.fn(() => Promise.resolve('timeline')),
  redirectToLastView: vi.fn(() => Promise.resolve()),
  renderListView: vi.fn(() => Promise.resolve({ List: 'payload list' })),
  resolveViewSetup: vi.fn(() =>
    Promise.resolve({
      preference: undefined,
      preferenceKey: 'k',
      query: {},
      saved: { sort: '-title' },
    }),
  ),
  views: [] as Array<{ path: string; slug: string; type: string }>,
}));

vi.mock('@payloadcms/ui/views/List', () => ({ renderListView: mocks.renderListView }));
vi.mock('@payloadcms/ui/utilities/getClientConfig', () => ({ getClientConfig: () => ({}) }));

vi.mock('../../../../../packages/ui/src/admin/views/List/DefaultListView.client.js', () => ({
  DefaultListView: () => null,
}));

vi.mock('../../../../../packages/ui/src/admin/views/List/ListFrame.client.js', () => ({
  ListFrameClient: () => null,
}));

vi.mock('../../../../../packages/ui/src/admin/views/List/groupedTable.js', () => ({}));

vi.mock('../../../../../packages/ui/src/admin/views/frame.js', () => ({
  buildFrameSlots: () => ({}),
}));

vi.mock('../../../../../packages/ui/src/admin/views/Board/index.js', () => ({
  BoardView: mocks.BoardView,
}));

vi.mock('../../../../../packages/ui/src/admin/views/Calendar/index.js', () => ({
  CalendarView: mocks.CalendarView,
}));

vi.mock('../../../../../packages/ui/src/admin/views/CustomCollectionView.js', () => ({
  CustomCollectionView: mocks.CustomCollectionView,
}));

vi.mock('../../../../../packages/ui/src/admin/views/Gallery/index.js', () => ({
  GalleryView: mocks.GalleryView,
}));

vi.mock('../../../../../packages/ui/src/admin/views/Timeline/index.js', () => ({
  TimelineView: mocks.TimelineView,
}));

vi.mock(
  '../../../../../packages/ui/src/admin/views/collectionViews.js',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    createViewRequest: ({ searchParams }: { searchParams?: Record<string, unknown> }) =>
      Promise.resolve({ query: searchParams ?? {}, user: { id: '1' } }),
    redirectToLastView: mocks.redirectToLastView,
    resolveCollectionViews: () => Promise.resolve({ runtime: [], views: mocks.views }),
    withPageProps: (props: object) =>
      Promise.resolve({ ...props, initPageResult: { filled: true } }),
  }),
);

vi.mock('../../../../../packages/ui/src/admin/views/viewSetup.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  clearStoredLimit: () => Promise.resolve(),
  resolveViewSetup: mocks.resolveViewSetup,
}));

const { ListView } = await import('../../../../../packages/ui/src/admin/views/List/ListView.js');

const server = {
  getHeaders: () => Promise.resolve(new Headers()),
  notFound: () => {
    throw new Error('not-found');
  },
  redirect: (path: string) => {
    throw new Error(`redirect ${path}`);
  },
};

function collection(types: string[]) {
  const runtime = types.map((type) => ({ slug: type, type }));
  mocks.views = runtime.map((view, index) => ({ ...view, path: index ? `/${view.slug}` : '' }));

  return {
    slug: 'tickets',
    admin: { custom: { frogbot: { views: mocks.views } }, pagination: { defaultLimit: 10 } },
    custom: { frogbot: { collectionViews: runtime } },
    fields: [],
    labels: { plural: 'Tickets', singular: 'Ticket' },
  };
}

function listProps(types: string[], segments: string[] | undefined, extra: object = {}) {
  return {
    collectionConfig: collection(types),
    i18n: {},
    params: segments ? { segments } : {},
    payload: { config: { routes: { admin: '/admin' } } },
    searchParams: {},
    server,
    viewType: 'list',
    ...extra,
  } as never;
}

const ROOT = ['collections', 'tickets'];

describe('ListView routing', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['board', mocks.BoardView],
    ['calendar', mocks.CalendarView],
    ['custom', mocks.CustomCollectionView],
    ['gallery', mocks.GalleryView],
    ['timeline', mocks.TimelineView],
  ])('renders a first %s view at the collection root', async (type, View) => {
    await expect(ListView(listProps([type, 'list'], ROOT))).resolves.toBe(type);
    expect(View).toHaveBeenCalledWith(
      expect.objectContaining({ initPageResult: { filled: true }, viewType: 'list' }),
    );
  });

  it("renders Payload's list in a relationship drawer when a board is first", async () => {
    const result = await ListView(
      listProps(['board', 'list'], ROOT, {
        server: {
          ...server,
          getHeaders: () => Promise.resolve(new Headers({ 'next-action': 'x' })),
        },
      }),
    );

    expect(isValidElement(result)).toBe(true);
    expect(mocks.BoardView).not.toHaveBeenCalled();
    expect(mocks.redirectToLastView).not.toHaveBeenCalled();
  });

  it("renders Payload's list in the hierarchy view when a board is first", async () => {
    const result = await ListView(listProps(['board'], ROOT, { viewType: 'hierarchy' }));

    expect(isValidElement(result)).toBe(true);
    expect(mocks.BoardView).not.toHaveBeenCalled();
  });

  it("renders a later list's own route through Payload's list renderer", async () => {
    const props = { initPageResult: {}, params: { segments: [...ROOT, 'list'] }, server };

    await expect(ListView(props as never)).resolves.toBe('payload list');
    expect(mocks.renderListView).toHaveBeenCalledWith({
      ...props,
      ComponentOverride: '@frogbotai/ui/admin/rsc#ListView',
      enableRowSelections: true,
      viewType: 'list',
    });
  });

  it("sends Payload's not-found on the list's own route to the server's not-found", async () => {
    mocks.renderListView.mockRejectedValueOnce(new Error('not-found'));
    const notFound = vi.fn(() => 'not found page');

    await expect(ListView({ initPageResult: {}, server: { notFound } } as never)).resolves.toBe(
      'not found page',
    );
  });

  it('keeps a saved setup on the list route, not the root, and skips the last-view redirect', async () => {
    await expect(ListView(listProps(['board', 'list'], [...ROOT, 'list']))).rejects.toThrow(
      'redirect /admin/collections/tickets/list?sort=-title',
    );
    expect(mocks.BoardView).not.toHaveBeenCalled();
    expect(mocks.redirectToLastView).not.toHaveBeenCalled();
  });

  it("returns not-found on a later list's route when its access denies the user", async () => {
    const props = listProps(['board', 'list'], [...ROOT, 'list']);
    mocks.views = mocks.views.filter(({ type }) => type !== 'list');

    await expect(ListView(props)).rejects.toThrow('not-found');
  });

  it('still redirects to the last view and keeps the setup at the root when the list is first', async () => {
    await expect(ListView(listProps(['list', 'board'], ROOT))).rejects.toThrow(
      'redirect /admin/collections/tickets?sort=-title',
    );
    expect(mocks.redirectToLastView).toHaveBeenCalledOnce();
  });
});
