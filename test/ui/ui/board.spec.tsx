import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InlineAddCard } from '../../../packages/ui/src/board/InlineAddCard';
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

describe('InlineAddCard', () => {
  const renderCard = (value: string, extra: Partial<Parameters<typeof InlineAddCard>[0]> = {}) => {
    const props = { onCancel: vi.fn(), onChange: vi.fn(), onSubmit: vi.fn(), value, ...extra };
    const view = render(<InlineAddCard {...props} />);

    return { ...props, input: view.getByRole('textbox', { name: 'Card title' }), view };
  };

  it('focuses the title and saves on Enter, asking for the next card', () => {
    const { input, onSubmit } = renderCard('Write tests');

    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledWith(true);
  });

  it('removes an empty card on Enter or blur and discards text on Escape', () => {
    const empty = renderCard('');

    fireEvent.keyDown(empty.input, { key: 'Enter' });
    fireEvent.blur(empty.input);

    expect(empty.onCancel).toHaveBeenCalledTimes(2);
    expect(empty.onSubmit).not.toHaveBeenCalled();

    empty.view.unmount();
    const typed = renderCard('Draft');

    fireEvent.keyDown(typed.input, { key: 'Escape' });

    expect(typed.onCancel).toHaveBeenCalledTimes(1);
    expect(typed.onSubmit).not.toHaveBeenCalled();
  });

  it('saves typed text on blur without asking for another card', () => {
    const { input, onSubmit } = renderCard('Draft');

    fireEvent.blur(input);

    expect(onSubmit).toHaveBeenCalledWith(false);
  });

  it('shows a failed save with Open form, and retries on Enter', () => {
    const onOpenForm = vi.fn();
    const { input, onSubmit, view } = renderCard('Draft', {
      error: 'Owner is required',
      onOpenForm,
    });

    expect(view.getByRole('alert').textContent).toContain('Owner is required');

    fireEvent.click(view.getByRole('button', { name: 'Open form' }));
    fireEvent.blur(input);

    expect(onOpenForm).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledWith(true);
  });
});
