import { render } from '@testing-library/react';
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
    useTranslation: () => ({ i18n: { language: 'en', t: (k: string) => k } }),
    useWindowInfo: () => ({ breakpoints: { s: false } }),
  };
});

vi.mock('../../../../../packages/ui/src/admin/views/CollectionViewFrame.client.js', () => ({
  CollectionViewFrame: ({ children }: { children: ReactNode }) => <>{children}</>,
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

const frame = (Table: ReactNode, groupedData?: unknown) => ({
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

describe('ListFrameClient done rows', () => {
  it('marks a done row in an ungrouped list', () => {
    state.data = {
      docs: [
        { completed: true, id: 'a' },
        { completed: false, id: 'b' },
      ],
    };

    state.isGroupingBy = false;
    const { container } = render(<ListFrameClient {...frame(table(['a', 'b']))} />);

    expect(container.querySelector('tr[data-id="a"]')?.hasAttribute('data-done')).toBe(true);
  });

  it('marks a done row in a list grouped by a field', () => {
    state.data = { docs: [{}, {}] };
    state.isGroupingBy = true;
    const groups = [
      { data: { docs: [{ completed: true, id: 'a' }] }, heading: 'Open', value: 'open' },
      { data: { docs: [{ completed: false, id: 'b' }] }, heading: 'Won', value: 'won' },
    ];

    const { container } = render(
      <ListFrameClient {...frame([table(['a']), table(['b'])], groups)} />,
    );

    expect(container.querySelector('tr[data-id="a"]')?.hasAttribute('data-done')).toBe(true);
    expect(container.querySelector('tr[data-id="b"]')?.hasAttribute('data-done')).toBe(false);
  });

  it('matches orderable rows, which have no data-id, by position', () => {
    state.data = {
      docs: [
        { completed: false, id: 'a' },
        { completed: true, id: 'b' },
      ],
    };

    state.isGroupingBy = false;

    const { container } = render(
      <ListFrameClient
        {...frame(
          <div className="table">
            <table>
              <tbody>
                <tr>
                  <td>a</td>
                </tr>
                <tr>
                  <td>b</td>
                </tr>
              </tbody>
            </table>
          </div>,
        )}
      />,
    );

    const rows = container.querySelectorAll('tbody tr');

    expect(rows[0]?.hasAttribute('data-done')).toBe(false);
    expect(rows[1]?.hasAttribute('data-done')).toBe(true);
  });
});
