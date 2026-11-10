import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withRowIds } from '../../../../../packages/ui/src/admin/views/List/rowIds.js';

function Table({ columns }: { columns: { renderedCells: ReactNode[] }[]; data: unknown[] }) {
  return createElement('table', null, columns[0]?.renderedCells);
}

function section(heading: false | string) {
  return createElement(
    'div',
    { className: 'table-wrap' },
    heading && createElement('h4', null, heading),
    createElement(
      'div',
      null,
      createElement(Table, {
        columns: [
          {
            active: true,
            renderedCells: [
              createElement('i', { key: 0 }, 'A'),
              createElement('i', { key: 1 }, 'B'),
            ],
          },
        ],
        data: [{ id: 'a' }, { id: 'b' }],
      }),
    ),
  );
}

afterEach(() => vi.restoreAllMocks());

describe('withRowIds', () => {
  it('puts each row id in its first cell', () => {
    const html = renderToStaticMarkup(withRowIds(section(false)));

    expect(html).toContain('data-row-id="a"');
    expect(html).toContain('data-row-id="b"');
  });

  it("keeps a section's static children free of React key warnings", () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderToStaticMarkup(withRowIds(section(false)));
    renderToStaticMarkup(withRowIds(section('Heading')));

    expect(error.mock.calls.flat().join(' ')).not.toContain('unique "key"');
  });
});
