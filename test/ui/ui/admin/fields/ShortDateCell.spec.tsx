import { render } from '@testing-library/react';
import type { ClientField, DefaultCellComponentProps } from 'payload';
import { describe, expect, it, vi } from 'vitest';

const { calls, DefaultCell } = vi.hoisted(() => {
  const calls: DefaultCellComponentProps[] = [];

  return {
    calls,
    DefaultCell: (props: DefaultCellComponentProps) => {
      calls.push(props);

      return <span>{typeof props.cellData === 'string' ? props.cellData : null}</span>;
    },
  };
});

vi.mock('@payloadcms/ui', () => ({
  DefaultCell,
  useTranslation: () => ({ i18n: { language: 'en' } }),
}));

const { ShortDateCell } =
  await import('../../../../../packages/ui/src/admin/fields/ShortDateCell/index.client.js');

const dueDate = { name: 'dueDate', type: 'date' } as ClientField;

const props = (cellData: unknown): DefaultCellComponentProps => ({
  cellData,
  collectionSlug: 'tasks',
  field: dueDate,
  link: true,
  rowData: { id: 1 },
});

describe('ShortDateCell', () => {
  it('writes the date short and keeps the default cell’s link', () => {
    const year = new Date().getFullYear();
    const { container } = render(
      <ShortDateCell {...props(new Date(year, 10, 24, 20, 13).toISOString())} />,
    );

    expect(container.textContent).toBe('Nov 24');
    expect(calls.at(-1)).toMatchObject({
      link: true,
      field: { name: 'dueDate', type: 'text' },
    });
  });

  it('adds the year for another year and draws nothing for no date', () => {
    const next = new Date().getFullYear() + 1;

    expect(render(<ShortDateCell {...props(new Date(next, 0, 3))} />).container.textContent).toBe(
      `Jan 3, ${next}`,
    );
    expect(render(<ShortDateCell {...props(null)} />).container.textContent).toBe('');
  });
});
