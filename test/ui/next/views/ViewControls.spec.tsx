import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ListControls: vi.fn(),
  query: {} as Record<string, unknown>,
  refineListData: vi.fn(),
  SortBuilder: vi.fn(() => null),
}));

vi.mock('@payloadcms/ui', async () => {
  const { createElement, useState } = await import('react');
  const dictionary: Record<string, string> = {
    'general:clear': 'Clear',
    'general:columns': 'Columns',
    'general:filters': 'Filters',
    'general:groupByLabel': 'Group by {{label}}',
    'general:sort': 'Sort',
  };
  const t = (key: string, vars?: Record<string, string>) =>
    Object.entries(vars ?? {}).reduce(
      (value, [name, replacement]) => value.replaceAll(`{{${name}}}`, replacement),
      dictionary[key] ?? key,
    );

  return {
    AnimateHeight: ({ children, height }: { children: React.ReactNode; height: number | string }) =>
      createElement('div', { 'data-height': height, 'data-testid': 'sort-height' }, children),
    ChevronIcon: () => createElement('svg', { 'data-testid': 'chevron' }),
    ListControls: (props: Record<string, unknown>) => {
      mocks.ListControls(props);
      const [drawer, setDrawer] = useState<string>();
      const toggle = (id: string, value: string) =>
        createElement('button', {
          'aria-expanded': drawer === value,
          id,
          key: id,
          onClick: () => setDrawer(drawer === value ? undefined : value),
        });
      return createElement('div', { className: 'list-controls' }, [
        createElement(
          'div',
          { 'data-testid': 'before-actions', key: 'before' },
          props.beforeActions,
        ),
        toggle('toggle-list-columns', 'columns'),
        toggle('toggle-list-filters', 'filters'),
        toggle('toggle-list-sort', 'sort'),
        toggle('toggle-group-by', 'group-by'),
      ]);
    },
    Pill: ({ children, className, icon, id, onClick, pillStyle }: Record<string, unknown>) =>
      createElement(
        'button',
        { className, 'data-pill-style': pillStyle, id, onClick, type: 'button' },
        [children, icon],
      ),
    useListQuery: () => ({ query: mocks.query, refineListData: mocks.refineListData }),
    useTranslation: () => ({ t }),
    XIcon: () => createElement('svg', { 'data-testid': 'x' }),
  };
});

vi.mock('../../../../packages/next/src/views/controls/SortBuilder.client.js', () => ({
  SortBuilder: mocks.SortBuilder,
}));

const { countWhereConditions, ViewControls } =
  await import('../../../../packages/next/src/views/controls/ViewControls.client.js');

const collectionConfig = {
  admin: { groupBy: true },
  fields: [{ name: 'title', label: 'Title', type: 'text' }],
  slug: 'posts',
};

const renderControls = (
  props: Record<string, unknown> = {},
  config: Record<string, unknown> = {},
) =>
  render(
    <ViewControls
      collectionConfig={{ ...collectionConfig, ...config } as never}
      collectionSlug="posts"
      enableSort
      {...props}
    />,
  );

const control = (placement: string, key: string) =>
  document.getElementById(`view-controls-${placement}-${key}`)!;
const clear = (placement: string, key: string) =>
  document.getElementById(`view-controls-${placement}-clear-${key}`)!;

beforeEach(() => {
  mocks.query = {};
  mocks.refineListData.mockClear();
  mocks.ListControls.mockClear();
});

describe('ViewControls', () => {
  it('renders one unified set in beforeActions and one CSS-controlled mobile set', () => {
    const { container } = renderControls();

    expect(
      screen.getByTestId('before-actions').querySelectorAll('.view-controls__control'),
    ).toHaveLength(4);
    expect(container.querySelectorAll('.view-controls__mobile-controls')).toHaveLength(1);
    expect(container.querySelector('.view-controls__active-state')).toBeNull();
    expect(control('desktop', 'columns').textContent).toBe('Columns');
    expect(control('mobile', 'columns').textContent).toBe('Columns');
  });

  it('preserves caller beforeActions before controls', () => {
    renderControls({ beforeActions: [<span key="caller">Caller</span>] });
    const actions = screen.getByTestId('before-actions');

    expect(actions.firstElementChild?.textContent).toBe('Caller');
    expect(mocks.ListControls).toHaveBeenLastCalledWith(
      expect.objectContaining({ beforeActions: expect.any(Array) }),
    );
  });

  it('renders inactive light pills with chevrons and no clear affordance', () => {
    renderControls();

    for (const key of ['columns', 'filters', 'sort', 'group-by']) {
      expect(control('desktop', key).getAttribute('data-pill-style')).toBe('light');
      expect(control('desktop', key).querySelector('[data-testid="chevron"]')).not.toBeNull();
      expect(clear('desktop', key)).toBeNull();
    }
  });

  it('changes filters, sort, and group by to counted success pills', () => {
    mocks.query = {
      columns: ['title'],
      groupBy: 'title',
      sort: '-title,title',
      where: { or: [{ and: [{ title: { equals: 'a' } }, { title: { equals: 'b' } }] }] },
    };
    renderControls();

    expect(control('desktop', 'columns').textContent).toBe('Columns');
    expect(control('desktop', 'columns').getAttribute('data-pill-style')).toBe('light');
    expect(control('desktop', 'columns').querySelector('[data-testid="chevron"]')).not.toBeNull();
    expect(clear('desktop', 'columns')).toBeNull();
    expect(control('desktop', 'filters').textContent).toBe('Filters: 2');
    expect(control('desktop', 'sort').textContent).toBe('Sort: 2');
    expect(control('desktop', 'group-by').textContent).toBe('Group by: 1');
    expect(control('desktop', 'filters').getAttribute('data-pill-style')).toBe('success');
    expect(control('desktop', 'filters').querySelector('[data-testid="x"]')).not.toBeNull();
    expect(control('desktop', 'filters').querySelector('[data-testid="chevron"]')).toBeNull();
  });

  it('omits disabled controls from both placements', () => {
    renderControls({
      enableColumns: false,
      enableFilters: false,
      enableGroupBy: false,
      enableSort: false,
    });

    expect(document.querySelectorAll('.view-controls__control')).toHaveLength(0);
  });

  it('opens native drawers and keeps sort expansion observer-driven', async () => {
    renderControls();
    fireEvent.click(control('desktop', 'sort'));

    await waitFor(() =>
      expect(screen.getByTestId('sort-height').getAttribute('data-height')).toBe('auto'),
    );
    fireEvent.click(control('desktop', 'columns'));
    await waitFor(() =>
      expect(screen.getByTestId('sort-height').getAttribute('data-height')).toBe('0'),
    );
  });

  it('clears without opening the native drawer, including keyboard activation', () => {
    mocks.query = { sort: 'title', where: { title: { equals: 'a' } } };
    renderControls();

    fireEvent.click(clear('desktop', 'filters'));
    expect(mocks.refineListData).toHaveBeenLastCalledWith({ where: {} });
    expect(document.getElementById('toggle-list-filters')?.getAttribute('aria-expanded')).toBe(
      'false',
    );
    fireEvent.keyDown(clear('desktop', 'sort'), { key: ' ' });
    expect(mocks.refineListData).toHaveBeenLastCalledWith({ page: 1, sort: '' });
  });
});

describe('control counters', () => {
  it('counts filter leaves', () => {
    expect(countWhereConditions({ title: { equals: 'a' } })).toBe(1);
    expect(countWhereConditions({ or: [{ and: [{ title: { equals: 'a' } }] }] })).toBe(1);
  });
});
