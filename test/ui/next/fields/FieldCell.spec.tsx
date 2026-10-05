import { render, screen } from '@testing-library/react';
import type { ClientField, DefaultCellComponentProps } from 'payload';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { DefaultCell } = vi.hoisted(() => ({
  DefaultCell: vi.fn((_props: unknown) => <span data-testid="default-cell" />),
}));

vi.mock('@payloadcms/ui', () => ({ DefaultCell }));

const { FieldCell } =
  await import('../../../../packages/next/src/fields/FieldCell/index.client.js');

const channelField = {
  name: 'channel',
  type: 'text',
  admin: { custom: { frogbot: { kind: { type: 'channel' } } } },
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
    ['an unknown kind', { custom: { frogbot: { kind: { type: 'money' } } } }],
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
});
