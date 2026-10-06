import { render } from '@testing-library/react';
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
