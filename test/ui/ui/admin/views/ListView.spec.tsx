import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createViewRequest: vi.fn(),
  DefaultListView: vi.fn((_props: Record<string, unknown>) => null),
  getPreferences: vi.fn(),
  getRuntimeViews: vi.fn((): unknown[] => []),
  ListFrameClient: vi.fn((_props: Record<string, unknown>) => null),
  resolveCollectionViews: vi.fn(),
}));

vi.mock('@payloadcms/ui/utilities/upsertPreferences', () => ({
  getPreferences: mocks.getPreferences,
  upsertPreferences: vi.fn(),
}));

vi.mock('../../../../../packages/ui/src/admin/views/frame.js', () => ({
  buildFrameSlots: () => ({}),
}));

vi.mock('../../../../../packages/ui/src/admin/views/List/ListFrame.client.js', () => ({
  ListFrameClient: mocks.ListFrameClient,
}));

vi.mock('../../../../../packages/ui/src/admin/views/List/DefaultListView.client.js', () => ({
  DefaultListView: mocks.DefaultListView,
}));

vi.mock('../../../../../packages/ui/src/admin/views/collectionViews.js', () => ({
  createViewRequest: mocks.createViewRequest,
  getRuntimeViews: mocks.getRuntimeViews,
  redirectToLastView: vi.fn(),
  resolveCollectionViews: mocks.resolveCollectionViews,
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

  describe('on the collection page', () => {
    const find = vi.fn();
    const payload = { config: { routes: { admin: '/admin' } }, find, importMap: {} };

    function pageProps(overrides: Record<string, unknown> = {}) {
      return listProps({
        collectionConfig: {
          admin: { components: {}, custom: { frogbot: { useAsDone: 'completed' } } },
          slug: 'tasks',
        },
        collectionSlug: 'tasks',
        params: { segments: ['collections', 'tasks'] },
        payload,
        server: { redirect: vi.fn() },
        ...overrides,
      });
    }

    function setup(saved?: Record<string, unknown>) {
      mocks.ListFrameClient.mockClear();
      find.mockReset();
      mocks.getRuntimeViews.mockReturnValue([{ slug: 'list', type: 'list' }]);
      mocks.resolveCollectionViews.mockResolvedValue({ views: [] });

      mocks.createViewRequest.mockResolvedValue({
        payload: { ...payload, count: vi.fn().mockResolvedValue({ totalDocs: 1 }) },
        query: {},
        user: { collection: 'users', id: 'u1' },
      });

      mocks.getPreferences.mockResolvedValue(saved ? { id: 1, value: saved } : null);
    }

    it('opens the saved setup on a fresh visit', async () => {
      setup({ sort: 'title' });
      const props = pageProps();

      await ListView(props as never);

      expect(props.server.redirect).toHaveBeenCalledWith('/admin/collections/tasks?sort=title');
    });

    it.each([
      ['empty filters', { where: {} }],
      ['empty columns', { columns: [] }],
    ])(
      'does not redirect to an empty query for a saved setup holding only %s',
      async (_, saved) => {
        setup(saved);
        const props = pageProps();

        await ListView(props as never);

        expect(props.server.redirect).not.toHaveBeenCalled();
      },
    );

    it('finds done records whose done field the table did not select', async () => {
      setup();

      find.mockResolvedValue({
        docs: [
          { completed: true, id: 'a' },
          { completed: false, id: 'b' },
        ],
      });

      await ListView(
        pageProps({
          data: {
            docs: [
              { id: 'a', title: 'A' },
              { id: 'b', title: 'B' },
              { completed: true, id: 'c', title: 'C' },
            ],
          },
        }) as never,
      );

      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'tasks',
          overrideAccess: false,
          select: { completed: true },
          where: { id: { in: ['a', 'b'] } },
        }),
      );
      expect(mocks.ListFrameClient.mock.lastCall?.[0]).toMatchObject({ doneIds: ['a', 'c'] });
    });

    it('puts each row id in its own cells, so a reordered table keeps it', async () => {
      setup();
      const Orderable = ({
        columns,
        data,
      }: {
        columns: Array<{ active: boolean; renderedCells: ReactNode[] }>;
        data: Array<{ id: string }>;
      }) => (
        <table>
          <tbody>
            {[...data.keys()].reverse().map((index) => (
              <tr key={data[index].id}>
                {columns.map((column, columnIndex) => (
                  <td key={columnIndex}>{column.renderedCells[index]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );

      await ListView(
        pageProps({
          data: { docs: [{ id: 'a' }, { id: 'b' }] },
          Table: (
            <div>
              <Orderable
                columns={[{ active: true, renderedCells: [<i key={0}>a</i>, <i key={1}>b</i>] }]}
                data={[{ id: 'a' }, { id: 'b' }]}
              />
            </div>
          ),
        }) as never,
      );

      const listProps = mocks.ListFrameClient.mock.lastCall?.[0].listProps as { Table: ReactNode };
      const { container } = render(<>{listProps.Table}</>);
      const rows = [...container.querySelectorAll('tbody tr')];

      expect(
        rows.map((row) => row.querySelector('[data-row-id]')?.getAttribute('data-row-id')),
      ).toEqual(['b', 'a']);
      expect(rows.map((row) => row.textContent)).toEqual(['b', 'a']);
    });
  });
});
