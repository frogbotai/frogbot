import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Board, type BoardProps } from '../../../packages/ui/src/index';

type Row = { id: string; status?: string };

const columns = [
  { color: 'green' as const, key: 'done', label: 'Done', value: 'done' },
  { key: 'backlog', label: 'Backlog', value: 'backlog' },
];

const renderBoard = (renderColumnHeader?: BoardProps<Row>['renderColumnHeader']) =>
  render(
    <Board<Row>
      columns={columns}
      getId={(row) => row.id}
      groupBy={(row) => row.status}
      renderCard={(row) => row.id}
      renderColumnHeader={renderColumnHeader}
      rows={[]}
    />,
  );

const getHeaders = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.frog-board__column-header'));

describe('Board column headers', () => {
  it('draws a coloured column label as a pill with its count', () => {
    const { container } = renderBoard();

    const [done] = getHeaders(container);
    const pill = done.querySelector('.fb-option-pill.fb-option-pill--green');

    expect(pill?.textContent).toBe('Done');
    expect(done.querySelector('strong')).toBeNull();
    expect(done.querySelector('.frog-board__column-count')?.textContent).toBe('0');
  });

  it('draws uncoloured and Uncategorized labels as plain text', () => {
    const { container } = renderBoard();

    const [, backlog, uncategorized] = getHeaders(container);

    expect(backlog.querySelector('strong')?.textContent).toBe('Backlog');
    expect(backlog.querySelector('.fb-option-pill')).toBeNull();
    expect(uncategorized.querySelector('strong')?.textContent).toBe('Uncategorized');
    expect(uncategorized.querySelector('.fb-option-pill')).toBeNull();
  });

  it('passes the column colour to renderColumnHeader', () => {
    const renderColumnHeader = vi.fn(() => null);

    renderBoard(renderColumnHeader);

    expect(renderColumnHeader).toHaveBeenCalledWith(
      { color: 'green', key: 'done', label: 'Done' },
      0,
    );
    expect(renderColumnHeader).toHaveBeenCalledWith(
      { color: undefined, key: '', label: 'Uncategorized' },
      0,
    );
  });
});

describe('Board totals, collapse, hide and empty columns', () => {
  const renderWith = (props: Partial<BoardProps<Row>>) =>
    render(
      <Board<Row>
        columns={columns}
        getId={(row) => row.id}
        groupBy={(row) => row.status}
        renderCard={(row) => row.id}
        rows={[{ id: 'a', status: 'done' }]}
        {...props}
      />,
    );

  it('shows the total, not the loaded rows, in the default and custom headers', () => {
    const renderColumnHeader = vi.fn(() => null);
    const { container } = renderWith({ totals: { done: 120 } });

    expect(getHeaders(container)[0].querySelector('.frog-board__column-count')?.textContent).toBe(
      '120',
    );

    renderWith({ renderColumnHeader, totals: { done: 120 } });

    expect(renderColumnHeader).toHaveBeenCalledWith(expect.objectContaining({ key: 'done' }), 120);
  });

  it('marks an empty column without hiding the loaded ones', () => {
    const { container } = renderWith({});
    const empty = Array.from(container.querySelectorAll('.frog-board__column')).map((column) =>
      Boolean(column.querySelector('.frog-board__empty')),
    );

    expect(empty).toEqual([false, true, true]);
    expect(container.querySelector('.frog-board__empty')?.textContent).toBe('No cards');
  });

  it('draws a collapsed column as a strip that expands on click', () => {
    const onColumnStateChange = vi.fn();
    const { container, getByRole } = renderWith({
      columnState: { collapsed: ['done'], hidden: [] },
      onColumnStateChange,
      totals: { done: 7 },
    });

    const strip = getByRole('button', { name: 'Expand Done' });

    expect(container.querySelector('.frog-board__column--collapsed')?.textContent).toContain('7');

    fireEvent.click(strip);

    expect(onColumnStateChange).toHaveBeenCalledWith({ collapsed: [], hidden: [] });
  });

  it('leaves hidden columns out and counts them in the restore control', () => {
    const { container, getByRole } = renderWith({
      columnState: { collapsed: [], hidden: ['backlog', ''] },
      onColumnStateChange: vi.fn(),
    });

    expect(container.querySelectorAll('.frog-board__column')).toHaveLength(1);
    expect(getByRole('button', { name: 'Hidden · 2' })).toBeTruthy();
  });

  it('offers no column menu without onColumnStateChange', () => {
    const { container } = renderWith({});

    expect(container.querySelector('.frog-board__column-menu')).toBeNull();
  });
});
