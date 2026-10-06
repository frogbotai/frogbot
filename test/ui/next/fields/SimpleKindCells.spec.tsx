import { fireEvent, render, screen } from '@testing-library/react';
import type { ClientField, DefaultCellComponentProps } from 'payload';
import type { ComponentType, ReactNode } from 'react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

const { DefaultCell, translation } = vi.hoisted(() => ({
  DefaultCell: vi.fn(({ cellData }: { cellData?: unknown }) => (
    <span data-testid="default-cell">{cellData as ReactNode}</span>
  )),
  translation: { language: 'en' },
}));

vi.mock('@payloadcms/ui', () => ({
  DefaultCell,
  useTranslation: () => ({ i18n: { language: translation.language } }),
  withCondition: <T,>(Component: T) => Component,
}));

const { BarcodeCell } =
  await import('../../../../packages/next/src/fields/Barcode/index.client.js');
const { DurationCell } =
  await import('../../../../packages/next/src/fields/Duration/index.client.js');
const { KindLink } = await import('../../../../packages/next/src/fields/KindLink/index.client.js');
const { PercentCell } =
  await import('../../../../packages/next/src/fields/Percent/index.client.js');
const { PhoneCell } = await import('../../../../packages/next/src/fields/Phone/index.client.js');
const { RatingCell } = await import('../../../../packages/next/src/fields/Rating/index.client.js');
const { UrlCell } = await import('../../../../packages/next/src/fields/Url/index.client.js');

type KindCell = ComponentType<DefaultCellComponentProps>;

function kindField(type: 'number' | 'text', kind: Record<string, unknown>): ClientField {
  return { name: 'value', type, admin: { custom: { frogbot: { kind } } } } as ClientField;
}

const fields = {
  barcode: kindField('text', { type: 'barcode' }),
  duration: kindField('number', { type: 'duration', format: 'h:mm:ss' }),
  percent: kindField('number', { type: 'percent', precision: 0 }),
  phone: kindField('text', { type: 'phone' }),
  rating: kindField('number', { type: 'rating', max: 5 }),
  url: kindField('text', { type: 'url' }),
};

const cells: [keyof typeof fields, KindCell][] = [
  ['barcode', BarcodeCell],
  ['duration', DurationCell],
  ['percent', PercentCell],
  ['phone', PhoneCell],
  ['rating', RatingCell],
  ['url', UrlCell],
];

function cell(
  field: ClientField,
  cellData: unknown,
  props: Partial<DefaultCellComponentProps> = {},
): DefaultCellComponentProps {
  return { cellData, collectionSlug: 'tasks', field, rowData: { id: 'row' }, ...props };
}

function lastProps(): DefaultCellComponentProps {
  return DefaultCell.mock.lastCall?.[0] as DefaultCellComponentProps;
}

describe('simple kind cells', () => {
  beforeEach(() => {
    DefaultCell.mockClear();
    translation.language = 'en';
  });

  describe.each(cells)('%s', (kind, Cell) => {
    it.each([null, undefined, ''])('renders nothing for %j', (cellData) => {
      const { container } = render(<Cell {...cell(fields[kind], cellData)} />);

      expect(container.childElementCount).toBe(0);
      expect(DefaultCell).not.toHaveBeenCalled();
    });
  });

  it.each<[keyof typeof fields, KindCell, unknown]>([
    ['url', UrlCell, 'javascript:alert(1)'],
    ['url', UrlCell, 'mailto:a@b.com'],
    ['phone', PhoneCell, 'call me'],
    ['rating', RatingCell, 0],
    ['rating', RatingCell, 3.5],
    ['rating', RatingCell, 6],
    ['duration', DurationCell, 1.5],
    ['percent', PercentCell, '0.42'],
  ])('passes the invalid %s value %j to the default cell unchanged', (kind, Cell, cellData) => {
    const props = cell(fields[kind], cellData);

    const { container } = render(<Cell {...props} />);

    expect(lastProps()).toStrictEqual(props);
    expect(container.querySelector('a')).toBeNull();
  });

  it('formats a percent', () => {
    render(<PercentCell {...cell(fields.percent, 0.42)} />);

    expect(screen.getByTestId('default-cell').textContent).toBe('42%');
  });

  it('formats a percent in the admin language', () => {
    translation.language = 'de';

    render(<PercentCell {...cell(fields.percent, 0.42)} />);

    expect(screen.getByTestId('default-cell').textContent).toBe('42\u00a0%');
  });

  it('formats a zero percent with its precision', () => {
    const field = kindField('number', { type: 'percent', precision: 1 });

    render(<PercentCell {...cell(field, 0)} />);

    expect(screen.getByTestId('default-cell').textContent).toBe('0.0%');
  });

  it('formats a zero duration', () => {
    render(<DurationCell {...cell(fields.duration, 0)} />);

    expect(screen.getByTestId('default-cell').textContent).toBe('0:00');
  });

  it('formats a duration in h:mm', () => {
    const field = kindField('number', { type: 'duration', format: 'h:mm' });

    render(<DurationCell {...cell(field, 5400)} />);

    expect(screen.getByTestId('default-cell').textContent).toBe('1:30');
  });

  it('draws a rating as filled and faint stars', () => {
    render(<RatingCell {...cell(fields.rating, 3)} />);

    const stars = screen.getByRole('img', { name: '3 of 5' });

    expect(stars.className).toBe('rating-stars');
    expect(stars.querySelectorAll('svg.rating-stars__star')).toHaveLength(5);
    expect(stars.querySelectorAll('svg.rating-stars__star--on')).toHaveLength(3);
    expect(stars.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(5);
  });

  it('draws a url as an external link when the cell has no row link', () => {
    render(<UrlCell {...cell(fields.url, 'example.com/pricing')} />);

    const link = screen.getByRole('link');

    expect(link.getAttribute('href')).toBe('https://example.com/pricing');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('title')).toBe('example.com/pricing');
    expect(link.className).toBe('kind-link url-cell');
    expect(link.textContent).toBe('example.com/pricing');
  });

  it.each<[string, Partial<DefaultCellComponentProps>]>([
    ['link', { link: true }],
    ['onClick', { onClick: vi.fn() }],
  ])('draws a url as plain text when the cell has %s', (_name, props) => {
    const { container } = render(<UrlCell {...cell(fields.url, 'example.com/pricing', props)} />);

    const text = container.querySelector('.url-cell');

    expect(container.querySelector('a')).toBeNull();
    expect(text?.tagName).toBe('SPAN');
    expect(text?.getAttribute('title')).toBe('example.com/pricing');
    expect(text?.textContent).toBe('example.com/pricing');
  });

  it('draws a phone as a tel link with the number as typed', () => {
    render(<PhoneCell {...cell(fields.phone, '+44 20 7946 0958')} />);

    const link = screen.getByRole('link');

    expect(link.getAttribute('href')).toBe('tel:+442079460958');
    expect(link.getAttribute('target')).toBeNull();
    expect(link.textContent).toBe('+44 20 7946 0958');
  });

  it('draws a phone as formatted plain text when the cell has a row link', () => {
    const { container } = render(
      <PhoneCell {...cell(fields.phone, '5551234567', { link: true })} />,
    );

    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByTestId('default-cell').textContent).toBe('(555) 123-4567');
  });

  it('keeps a link click from reaching the card', () => {
    const onCardClick = vi.fn();

    document.addEventListener('click', onCardClick);
    onTestFinished(() => document.removeEventListener('click', onCardClick));
    render(<KindLink href="#pricing">Pricing</KindLink>);

    fireEvent.click(screen.getByRole('link'));

    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('passes a barcode through to the default cell', () => {
    const props = cell(fields.barcode, '0123456789012');

    render(<BarcodeCell {...props} />);

    expect(lastProps()).toStrictEqual(props);
    expect(screen.getByTestId('default-cell').textContent).toBe('0123456789012');
  });
});
