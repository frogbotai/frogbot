import { render, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  DefaultListView: vi.fn((_props: Record<string, unknown>) => null),
  RenderServerComponent: vi.fn(),
}));

vi.mock('@payloadcms/ui', () => ({
  NoListResults: ({
    Actions,
    description,
    title,
  }: {
    Actions: ReactNode[];
    description: string;
    title: string;
  }) => (
    <div data-testid="no-results">
      <h2>{title}</h2>
      <p>{description}</p>
      {Actions}
    </div>
  ),
}));

vi.mock('@payloadcms/ui/elements/RenderServerComponent', () => ({
  RenderServerComponent: mocks.RenderServerComponent,
}));

vi.mock('../../../../../packages/ui/src/admin/views/List/DefaultListView.client.js', () => ({
  DefaultListView: mocks.DefaultListView,
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

function listProps({
  CreateButton,
  docs = [{ id: 1 }],
  toolbar,
  ...overrides
}: Record<string, unknown> & { CreateButton?: string; docs?: unknown[]; toolbar?: string[] } = {}) {
  return {
    collectionConfig: {
      admin: { components: CreateButton ? { CreateButton } : {} },
      custom: {
        frogbot: { collectionViews: [{ type: 'list', slug: 'list', components: { toolbar } }] },
      },
      slug: 'posts',
    },
    collectionSlug: 'posts',
    columnState: [],
    data: { docs },
    hasCreatePermission: true,
    hasDeletePermission: false,
    i18n: { t: (key: string) => key },
    limit: 10,
    listPreferences: { columns: [] },
    listSearchableFields: [],
    locale: undefined,
    newDocumentURL: '/admin/collections/posts/create',
    params: {},
    payload: { importMap: {} },
    permissions: {},
    searchParams: {},
    server: {},
    Table: null,
    user: { id: 'u1' },
    viewType: 'list',
    ...overrides,
  };
}

function renderList(props: ReturnType<typeof listProps>) {
  render(ListView(props as never));

  return mocks.DefaultListView.mock.lastCall![0] as Record<string, unknown> & {
    pageSlots?: { beforeActions?: ReactNode[]; hideCreateNew?: boolean; NoResults?: ReactNode };
  };
}

describe('ListView', () => {
  beforeEach(() => {
    mocks.DefaultListView.mockClear();
    mocks.RenderServerComponent.mockReset();

    mocks.RenderServerComponent.mockImplementation(
      ({ Component, clientProps }: { Component: string | string[]; clientProps: object }) => {
        const one = (path: string, key?: number) => (
          <button data-props={JSON.stringify(clientProps)} key={key} type="button">
            {path}
          </button>
        );

        return Array.isArray(Component) ? Component.map(one) : one(Component);
      },
    );
  });

  it('passes the client list view no server props and keeps listPreferences', () => {
    const received = renderList(listProps({ toolbar: ['./Toolbar'] }));

    for (const key of serverKeys) expect(received).not.toHaveProperty(key);

    expect(received.listPreferences).toEqual({ columns: [] });
    expect(received.newDocumentURL).toBe('/admin/collections/posts/create');
  });

  it("leaves Payload's props untouched without toolbar, CreateButton or NoResults", () => {
    const beforeActions = [<span key="x">x</span>];
    const received = renderList(listProps({ beforeActions }));

    expect(received.pageSlots).toBeUndefined();
    expect(received.beforeActions).toBe(beforeActions);
    expect(mocks.RenderServerComponent).not.toHaveBeenCalled();
  });

  it('appends the toolbar and then the CreateButton to beforeActions', () => {
    const received = renderList(
      listProps({
        beforeActions: [<span key="incoming">Incoming</span>],
        CreateButton: './Create',
        toolbar: ['./One', './Two'],
      }),
    );

    const { container } = render(<div>{received.pageSlots?.beforeActions}</div>);

    expect([...container.firstElementChild!.children].map((node) => node.textContent)).toEqual([
      'Incoming',
      './One',
      './Two',
      './Create',
    ]);
    expect(container.querySelector('.fb-create-button')?.textContent).toBe('./Create');
    expect(received.pageSlots?.hideCreateNew).toBe(true);
    expect(JSON.parse(container.querySelector('button')!.dataset.props!)).toEqual({
      collectionSlug: 'posts',
      hasCreatePermission: true,
      hasDeletePermission: false,
      newDocumentURL: '/admin/collections/posts/create',
    });
  });

  it('shows one CreateButton in the toolbar and one in the empty state', () => {
    const received = renderList(listProps({ CreateButton: './Create', docs: [] }));
    const toolbar = within(render(<div>{received.pageSlots?.beforeActions}</div>).container);
    const empty = within(render(<div>{received.pageSlots?.NoResults}</div>).container);

    expect(toolbar.getAllByRole('button', { name: './Create' })).toHaveLength(1);
    expect(empty.getAllByRole('button', { name: './Create' })).toHaveLength(1);
    expect(empty.getByRole('heading').textContent).toBe('general:noResultsFound');
    expect(empty.getByText('general:noResultsDescription')).toBeTruthy();
  });

  it('adds no empty state while there are documents', () => {
    const received = renderList(listProps({ CreateButton: './Create' }));

    expect(received.pageSlots?.NoResults).toBeUndefined();
  });

  it('renders no CreateButton in trash but keeps the toolbar', () => {
    const received = renderList(
      listProps({ CreateButton: './Create', docs: [], toolbar: ['./One'], viewType: 'trash' }),
    );

    const { container } = render(<div>{received.pageSlots?.beforeActions}</div>);

    expect(container.textContent).toBe('./One');
    expect(received.pageSlots?.hideCreateNew).toBeUndefined();
    expect(received.pageSlots?.NoResults).toBeUndefined();
  });

  it('lets an authored NoResults win over the CreateButton empty state', () => {
    const NoResults = <p>Nothing yet</p>;
    const received = renderList(listProps({ CreateButton: './Create', docs: [], NoResults }));

    expect(received).not.toHaveProperty('NoResults');
    expect(received.pageSlots?.NoResults).toBe(NoResults);
  });
});
