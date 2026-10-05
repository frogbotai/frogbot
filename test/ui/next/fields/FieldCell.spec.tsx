import { render, screen } from '@testing-library/react';
import type { ClientField, DefaultCellComponentProps } from 'payload';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { DefaultCell, useTranslation } = vi.hoisted(() => ({
  DefaultCell: vi.fn((_props: unknown) => <span data-testid="default-cell" />),
  useTranslation: vi.fn(() => ({ i18n: { language: 'en' } })),
}));

vi.mock('@payloadcms/ui', () => ({
  DefaultCell,
  useTranslation,
  withCondition: <T,>(Component: T) => Component,
}));

const { FieldCell } =
  await import('../../../../packages/next/src/fields/FieldCell/index.client.js');

const channelField = {
  name: 'channel',
  type: 'text',
  admin: { custom: { frogbot: { kind: { type: 'channel' } } } },
} as ClientField;

const priceField = {
  name: 'price',
  type: 'number',
  admin: { custom: { frogbot: { kind: { type: 'money', currency: 'USD', precision: 'auto' } } } },
} as ClientField;

const titleField = { name: 'title', type: 'text' } as ClientField;
const authorField = { name: 'author', type: 'relationship', relationTo: 'users' } as ClientField;

function cell(field: ClientField, cellData: unknown): DefaultCellComponentProps {
  return { cellData, collectionSlug: 'tasks', field, rowData: { id: 'row' } };
}

function textFieldWith(admin: unknown): ClientField {
  return { name: 'title', type: 'text', admin } as ClientField;
}

function lastCellData(): unknown {
  return (DefaultCell.mock.lastCall?.[0] as DefaultCellComponentProps).cellData;
}

function kindField(type: 'number' | 'text', kind: Record<string, unknown>): ClientField {
  return { name: 'value', type, admin: { custom: { frogbot: { kind } } } } as ClientField;
}

function renderLastCellData(): HTMLElement {
  return render(<>{lastCellData() as ReactNode}</>).container;
}

const optionColors = { done: 'green' };

const statusField = {
  name: 'status',
  type: 'select',
  admin: { custom: { frogbot: { optionColors } } },
  options: [
    { label: { de: 'Erledigt', en: 'Done' }, value: 'done' },
    { label: 'To do', value: 'todo' },
  ],
} as ClientField;

function lastProps(): DefaultCellComponentProps {
  return DefaultCell.mock.lastCall?.[0] as DefaultCellComponentProps;
}

function renderPills(): { className: string; text: string | null }[] {
  const { options } = lastProps().field as { options: { label: ReactNode }[] };
  const { container } = render(<>{options[0]?.label}</>);

  return Array.from(container.querySelectorAll('.option-pills > span'), (pill) => ({
    className: pill.className,
    text: pill.textContent,
  }));
}

describe('FieldCell', () => {
  beforeEach(() => {
    DefaultCell.mockClear();
  });

  it('renders a channel kind as a badge', () => {
    render(<FieldCell {...cell(channelField, 'slack')} />);

    expect(screen.getByText('slack').className).toBe('channel-cell');
    expect(DefaultCell).not.toHaveBeenCalled();
  });

  it.each([null, '', '  '])('renders nothing for the channel value %j', (cellData) => {
    const { container } = render(<FieldCell {...cell(channelField, cellData)} />);

    expect(container.childElementCount).toBe(0);
    expect(DefaultCell).not.toHaveBeenCalled();
  });

  it('formats a money kind before the default cell', () => {
    render(<FieldCell {...cell(priceField, 0.016455)} />);

    expect(lastCellData()).toBe('$0.02');
  });

  it('formats a percent kind before the default cell', () => {
    render(<FieldCell {...cell(kindField('number', { type: 'percent', precision: 0 }), 0.42)} />);

    expect(lastCellData()).toBe('42%');
  });

  it('draws a rating kind as stars', () => {
    render(<FieldCell {...cell(kindField('number', { type: 'rating', max: 5 }), 3)} />);

    expect(renderLastCellData().querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      '3 of 5',
    );
  });

  it('formats a duration kind before the default cell', () => {
    render(
      <FieldCell {...cell(kindField('number', { type: 'duration', format: 'h:mm:ss' }), 5400)} />,
    );

    expect(lastCellData()).toBe('1:30:00');
  });

  it('draws a url kind as a link', () => {
    render(<FieldCell {...cell(kindField('text', { type: 'url' }), 'example.com')} />);

    expect(renderLastCellData().querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com',
    );
  });

  it('draws a phone kind as a link', () => {
    render(<FieldCell {...cell(kindField('text', { type: 'phone' }), '5551234567')} />);

    expect(renderLastCellData().querySelector('a')?.getAttribute('href')).toBe('tel:5551234567');
  });

  it('renders nothing for an empty barcode kind', () => {
    const { container } = render(
      <FieldCell {...cell(kindField('text', { type: 'barcode' }), '')} />,
    );

    expect(container.childElementCount).toBe(0);
    expect(DefaultCell).not.toHaveBeenCalled();
  });

  it('passes every prop of an unmarked field to the default cell', () => {
    const props: DefaultCellComponentProps = {
      cellData: 'Write the report',
      className: 'cell-title',
      collectionSlug: 'tasks',
      columnIndex: 2,
      customCellProps: { tone: 'quiet' },
      field: titleField,
      link: true,
      linkURL: '/admin/collections/tasks/row',
      onClick: vi.fn(),
      rowData: { id: 'row', title: 'Write the report' },
      viewType: 'list',
    };

    render(<FieldCell {...props} />);

    expect(screen.getByTestId('default-cell')).toBeTruthy();
    expect(DefaultCell.mock.lastCall?.[0]).toStrictEqual(props);
  });

  it.each([
    ['an unknown kind', { custom: { frogbot: { kind: { type: 'rating' } } } }],
    ['a prototype-key kind', { custom: { frogbot: { kind: { type: 'toString' } } } }],
    ['a string kind', { custom: { frogbot: { kind: 'channel' } } }],
    ['an empty kind', { custom: { frogbot: { kind: {} } } }],
    ['a non-string kind type', { custom: { frogbot: { kind: { type: 42 } } } }],
    ['no admin config', undefined],
  ])('falls back to the default cell for %s', (_label, admin) => {
    const props = cell(textFieldWith(admin), 'slack');

    render(<FieldCell {...props} />);

    expect(screen.getByTestId('default-cell')).toBeTruthy();
    expect(DefaultCell.mock.lastCall?.[0]).toStrictEqual(props);
  });

  it('passes a populated relationship as its id', () => {
    render(<FieldCell {...cell(authorField, { id: 'u1', email: 'ada@example.com' })} />);

    expect(lastCellData()).toBe('u1');
  });

  it('passes a populated hasMany relationship as its ids', () => {
    render(<FieldCell {...cell(authorField, [{ id: 'u1' }, { id: 'u2' }])} />);

    expect(lastCellData()).toStrictEqual(['u1', 'u2']);
  });

  it('passes a populated polymorphic relationship with its value as an id', () => {
    render(<FieldCell {...cell(authorField, { relationTo: 'users', value: { id: 'u1' } })} />);

    expect(lastCellData()).toStrictEqual({ relationTo: 'users', value: 'u1' });
  });

  it('passes a populated upload as its id', () => {
    const field = { name: 'cover', type: 'upload', relationTo: 'media' } as ClientField;

    render(<FieldCell {...cell(field, { id: 'm1', url: '/media/cover.png' })} />);

    expect(lastCellData()).toBe('m1');
  });

  it.each(['u1', ['u1', 'u2'], { relationTo: 'users', value: 'u1' }])(
    'passes the relationship id value %j unchanged',
    (value) => {
      render(<FieldCell {...cell(authorField, value)} />);

      expect(lastCellData()).toStrictEqual(value);
    },
  );

  it('passes a json value with an id key unchanged', () => {
    const field = { name: 'payload', type: 'json' } as ClientField;
    const value = { id: 'x', name: 'y' };

    render(<FieldCell {...cell(field, value)} />);

    expect(lastCellData()).toBe(value);
  });

  it('renders the id column as raw text', () => {
    const field = { name: 'id', type: 'number' } as ClientField;

    const { container } = render(<FieldCell {...cell(field, 42)} />);

    expect(container.textContent).toBe('42');
    expect(DefaultCell).not.toHaveBeenCalled();
  });

  it('renders an empty id column as empty text', () => {
    const field = { name: 'id', type: 'text' } as ClientField;

    const { container } = render(<FieldCell {...cell(field, undefined)} />);

    expect(container.textContent).toBe('');
    expect(DefaultCell).not.toHaveBeenCalled();
  });

  it('passes every prop except the field to the default cell for a coloured select', () => {
    const props: DefaultCellComponentProps = {
      cellData: 'done',
      className: 'cell-status',
      collectionSlug: 'tasks',
      customCellProps: { tone: 'quiet' },
      field: statusField,
      link: true,
      linkURL: '/admin/collections/tasks/row',
      onClick: vi.fn(),
      rowData: { id: 'row', status: 'done' },
      viewType: 'list',
    };

    render(<FieldCell {...props} />);

    const { field, ...passed } = lastProps();
    const { field: _field, ...expected } = props;

    expect(passed).toStrictEqual(expected);
    expect(passed.onClick).toBe(props.onClick);
    expect({ ...field, options: statusField.options }).toStrictEqual(statusField);
    expect((field as { options: unknown[] }).options).toStrictEqual([
      { label: expect.anything(), value: 'done' },
    ]);
  });

  it('draws a coloured option as a pill with its translated label', () => {
    useTranslation.mockReturnValueOnce({ i18n: { language: 'de' } });

    render(<FieldCell {...cell(statusField, 'done')} />);

    expect(renderPills()).toStrictEqual([
      { className: 'fb-option-pill fb-option-pill--green', text: 'Erledigt' },
    ]);
  });

  it('draws hasMany values as pills in stored order, with gray for uncoloured options', () => {
    const cellData = ['done', 'todo'];

    render(<FieldCell {...cell({ ...statusField, hasMany: true } as ClientField, cellData)} />);

    expect((lastProps().field as { options: { value: unknown }[] }).options[0]?.value).toBe(
      cellData,
    );
    expect(renderPills()).toStrictEqual([
      { className: 'fb-option-pill fb-option-pill--green', text: 'Done' },
      { className: 'fb-option-pill fb-option-pill--gray', text: 'To do' },
    ]);
  });

  it.each(['archived', 'constructor'])('draws the unmatched value %s as a gray pill', (value) => {
    render(<FieldCell {...cell(statusField, value)} />);

    expect(renderPills()).toStrictEqual([
      { className: 'fb-option-pill fb-option-pill--gray', text: value },
    ]);
  });

  it('draws a coloured radio option as a pill', () => {
    const field = { ...statusField, type: 'radio' } as ClientField;

    render(<FieldCell {...cell(field, 'done')} />);

    expect(renderPills()).toStrictEqual([
      { className: 'fb-option-pill fb-option-pill--green', text: 'Done' },
    ]);
  });

  it.each([null, '', []])('passes the empty coloured value %j to the default cell', (cellData) => {
    const props = cell(statusField, cellData);

    render(<FieldCell {...props} />);

    expect(lastProps()).toStrictEqual(props);
    expect(lastProps().field).toBe(statusField);
  });

  it('passes a select without option colours to the default cell', () => {
    const field = { name: 'status', type: 'select', options: ['done'] } as ClientField;
    const props = cell(field, 'done');

    render(<FieldCell {...props} />);

    expect(lastProps()).toStrictEqual(props);
  });

  it('draws the kind cell when a coloured select also has a kind', () => {
    const field = {
      ...statusField,
      admin: { custom: { frogbot: { kind: { type: 'channel' }, optionColors } } },
    } as ClientField;

    render(<FieldCell {...cell(field, 'done')} />);

    expect(screen.getByText('done').className).toBe('channel-cell');
    expect(DefaultCell).not.toHaveBeenCalled();
  });
});
