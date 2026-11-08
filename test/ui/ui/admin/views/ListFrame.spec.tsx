import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  data: { docs: [] as Record<string, unknown>[] },
  isGroupingBy: false,
}));

vi.mock('@payloadcms/ui', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;

  return {
    ListSelection: () => null,
    PageControls: () => null,
    RelationshipProvider: Pass,
    SelectionProvider: Pass,
    TableColumnsProvider: Pass,
    useAuth: () => ({ permissions: {} }),
    useConfig: () => ({
      getEntityConfig: () => ({
        admin: { custom: { frogbot: { useAsDone: 'completed' } } },
        fields: [],
        labels: { plural: 'Tasks' },
        slug: 'tasks',
      }),
    }),
    useListDrawerContext: () => ({ isInDrawer: false }),
    useListQuery: () => state,
    useRouter: () => ({ refresh: () => undefined }),
    useTranslation: () => ({ i18n: { language: 'en', t: (k: string) => k } }),
    useWindowInfo: () => ({ breakpoints: { s: false } }),
  };
});

vi.mock('../../../../../packages/ui/src/admin/views/CollectionViewFrame.client.js', () => ({
  CollectionViewFrame: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../../../../packages/ui/src/admin/views/panel/RecordPanelProvider.client.js', () => ({
  useRecordPanel: () => ({ openId: '7' }),
  useRecordPanelEvents: () => undefined,
}));

vi.mock('../../../../../packages/ui/src/fields/AI/bulk.js', () => ({ aiBulkMenuFields: () => [] }));

vi.mock('../../../../../packages/ui/src/fields/AI/ListMenuItem.client.js', () => ({
  AIFieldListMenuItem: () => null,
}));

vi.mock('../../../../../packages/ui/src/admin/views/List/DefaultListView.client.js', () => ({
  DefaultListView: () => null,
}));

const { ListFrameClient } =
  await import('../../../../../packages/ui/src/admin/views/List/ListFrame.client.js');

const table = (ids: string[]) => (
  <div className="table">
    <table>
      <tbody>
        {ids.map((id) => (
          <tr data-id={id} key={id}>
            <td>{id}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const frame = (Table: ReactNode, doneIds: string[], groupedData?: unknown) => ({
  doneIds,
  hasCreateButton: false,
  isEmpty: false,
  listProps: {
    collectionSlug: 'tasks',
    groupedData,
    hasCreatePermission: true,
    Table,
    viewType: 'list',
  } as never,
  newDocumentURL: '/x',
  NoResults: null,
  tabs: [],
});

const orderable = (ids: string[]) => (
  <div className="table">
    <table>
      <tbody>
        {ids.map((id) => (
          <tr key={id}>
            <td>
              <span data-row-id={id} hidden />
              {id}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const rowFor = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll('tbody tr')].find((row) => row.textContent === label);

describe('ListFrameClient done rows', () => {
  it('marks the row open in the record panel as selected', () => {
    state.data = { docs: [{ id: '6' }, { id: '7' }] };
    state.isGroupingBy = false;
    const { container } = render(<ListFrameClient {...frame(table(['6', '7']), [])} />);

    expect(container.querySelector('tr[data-id="7"]')?.hasAttribute('data-selected')).toBe(true);
    expect(container.querySelector('tr[data-id="6"]')?.hasAttribute('data-selected')).toBe(false);
  });

  it('marks a done row in an ungrouped list', () => {
    state.data = { docs: [{ id: 'a' }, { id: 'b' }] };
    state.isGroupingBy = false;
    const { container } = render(<ListFrameClient {...frame(table(['a', 'b']), ['a'])} />);

    expect(container.querySelector('tr[data-id="a"]')?.hasAttribute('data-done')).toBe(true);
    expect(container.querySelector('tr[data-id="b"]')?.hasAttribute('data-done')).toBe(false);
  });

  it('marks a done row in a list grouped by a field', () => {
    state.data = { docs: [{}, {}] };
    state.isGroupingBy = true;
    const groups = [
      { data: { docs: [{ id: 'a' }] }, heading: 'Open', value: 'open' },
      { data: { docs: [{ id: 'b' }] }, heading: 'Won', value: 'won' },
    ];

    const { container } = render(
      <ListFrameClient {...frame([table(['a']), table(['b'])], ['a'], groups)} />,
    );

    expect(container.querySelector('tr[data-id="a"]')?.hasAttribute('data-done')).toBe(true);
    expect(container.querySelector('tr[data-id="b"]')?.hasAttribute('data-done')).toBe(false);
  });

  it('matches orderable rows, which have no data-id, by the row id in their cells', () => {
    state.data = { docs: [{ id: 'a' }, { id: 'b' }] };
    state.isGroupingBy = false;
    const { container } = render(<ListFrameClient {...frame(orderable(['a', 'b']), ['b'])} />);

    expect(rowFor(container, 'a')?.hasAttribute('data-done')).toBe(false);
    expect(rowFor(container, 'b')?.hasAttribute('data-done')).toBe(true);
  });

  it('keeps the done mark on its record after a drag reorders the rows before the list refetches', () => {
    state.data = { docs: [{ id: 'a' }, { id: 'b' }] };
    state.isGroupingBy = false;
    const { container } = render(<ListFrameClient {...frame(orderable(['b', 'a']), ['a'])} />);

    expect(rowFor(container, 'a')?.hasAttribute('data-done')).toBe(true);
    expect(rowFor(container, 'b')?.hasAttribute('data-done')).toBe(false);
  });

  it('marks rows the table adds after the frame rendered', async () => {
    state.data = { docs: [{ id: 'a' }] };
    state.isGroupingBy = false;
    const { container } = render(<ListFrameClient {...frame(orderable(['b']), ['a'])} />);
    const tbody = container.querySelector('tbody');
    const row = document.createElement('tr');
    row.innerHTML = '<td><span data-row-id="a" hidden></span>a</td>';
    tbody?.append(row);

    await waitFor(() => expect(row.hasAttribute('data-done')).toBe(true));
  });
});
