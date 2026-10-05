import { fireEvent, render, screen } from '@testing-library/react';
import type { ClientField, DefaultCellComponentProps, NumberFieldClientProps } from 'payload';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { DefaultCell, field, setValue, translation } = vi.hoisted(() => ({
  DefaultCell: vi.fn(({ cellData }: { cellData?: unknown }) => (
    <span data-testid="default-cell">{String(cellData)}</span>
  )),
  field: { value: undefined as unknown },
  setValue: vi.fn(),
  translation: { language: 'en' },
}));

vi.mock('@payloadcms/ui', () => ({
  DefaultCell,
  FieldDescription: ({ description }: { description?: string }) => <p>{description}</p>,
  FieldError: () => null,
  FieldLabel: ({ label }: { label?: string }) => <label>{label}</label>,
  RenderCustomComponent: ({
    CustomComponent,
    Fallback,
  }: {
    CustomComponent?: ReactNode;
    Fallback: ReactNode;
  }) => CustomComponent ?? Fallback,
  useField: ({ potentiallyStalePath }: { potentiallyStalePath: string }) => ({
    customComponents: {},
    disabled: false,
    path: potentiallyStalePath,
    setValue,
    showError: false,
    value: field.value,
  }),
  useTranslation: () => ({ i18n: { language: translation.language } }),
  withCondition: <T,>(Component: T) => Component,
}));

const { MoneyCell, MoneyField } =
  await import('../../../../packages/next/src/fields/Money/index.client.js');

function moneyField(currency = 'USD', admin: Record<string, unknown> = {}) {
  return {
    name: 'price',
    type: 'number',
    label: 'Price',
    min: 0,
    admin: {
      ...admin,
      custom: { frogbot: { kind: { type: 'money', currency, precision: 'auto' } } },
    },
  } as ClientField & NumberFieldClientProps['field'];
}

function cell(cellData: unknown, currency?: string): DefaultCellComponentProps {
  return {
    cellData,
    collectionSlug: 'products',
    field: moneyField(currency),
    rowData: { id: 'p1' },
  };
}

function renderField(props: Partial<NumberFieldClientProps> = {}) {
  return render(<MoneyField field={moneyField()} path="price" {...props} />);
}

describe('MoneyCell', () => {
  beforeEach(() => {
    DefaultCell.mockClear();
    translation.language = 'en';
  });

  it('formats a sub-cent amount in English', () => {
    render(<MoneyCell {...cell(0.00017270000000000002)} />);

    expect(screen.getByTestId('default-cell').textContent).toBe('$0.000173');
  });

  it('formats in the admin language', () => {
    translation.language = 'de';

    render(<MoneyCell {...cell(1234.5)} />);

    expect(screen.getByTestId('default-cell').textContent).toBe('1.234,50\u00a0$');
  });

  it('formats in the currency from the field kind', () => {
    render(<MoneyCell {...cell(12.5, 'EUR')} />);

    expect(screen.getByTestId('default-cell').textContent).toBe('€12.50');
  });

  it('formats zero as an amount', () => {
    render(<MoneyCell {...cell(0)} />);

    expect(screen.getByTestId('default-cell').textContent).toBe('$0.00');
  });

  it.each([null, undefined, Number.NaN])('renders nothing for %s', (cellData) => {
    const { container } = render(<MoneyCell {...cell(cellData)} />);

    expect(container.childElementCount).toBe(0);
    expect(DefaultCell).not.toHaveBeenCalled();
  });

  it('passes the link, class name and row to the default cell', () => {
    const props: DefaultCellComponentProps = {
      ...cell(3.25),
      className: 'cell-price',
      link: true,
      linkURL: '/admin/collections/products/p1',
      rowData: { id: 'p1', price: 3.25 },
    };

    render(<MoneyCell {...props} />);

    expect(DefaultCell.mock.lastCall?.[0]).toStrictEqual({ ...props, cellData: '$3.25' });
  });
});

describe('MoneyField', () => {
  beforeEach(() => {
    field.value = undefined;
    setValue.mockClear();
    translation.language = 'en';
  });

  it('shows the currency symbol before a number input', () => {
    field.value = 3.25;

    const { container } = renderField();
    const input = container.querySelector('input');

    expect(container.querySelector('.money-field__currency')?.textContent).toBe('$');
    expect(input?.type).toBe('number');
    expect(input?.value).toBe('3.25');
    expect(input?.getAttribute('step')).toBe('any');
    expect(input?.getAttribute('min')).toBe('0');
    expect(input?.hasAttribute('max')).toBe(false);
  });

  it('keeps the number field classes', () => {
    const { container } = renderField();

    expect(container.firstElementChild?.className).toBe('field-type number money-field');
  });

  it('saves a typed amount', () => {
    const { container } = renderField();

    fireEvent.change(container.querySelector('input')!, { target: { value: '12.5' } });

    expect(setValue).toHaveBeenCalledWith(12.5);
  });

  it('saves null when the amount is cleared', () => {
    field.value = 12.5;

    const { container } = renderField();

    fireEvent.change(container.querySelector('input')!, { target: { value: '' } });

    expect(setValue).toHaveBeenCalledWith(null);
  });

  it('shows a read-only amount as text', () => {
    field.value = 3.25;

    const { container } = renderField({ readOnly: true });

    expect(screen.getByText('Price').tagName).toBe('LABEL');
    expect(container.querySelector('.money-field__value')?.textContent).toBe('$3.25');
    expect(container.querySelector('input')).toBeNull();
  });

  it('shows no amount for an empty read-only value', () => {
    const { container } = renderField({ readOnly: true });

    expect(container.querySelector('.money-field__value')?.textContent).toBe('');
    expect(container.querySelector('input')).toBeNull();
  });
});
