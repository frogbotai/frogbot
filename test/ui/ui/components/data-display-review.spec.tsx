import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Chart,
  CopyValue,
  Fact,
  FactList,
  formatValue,
  Media,
  Meter,
  Sparkline,
  Value,
} from '../../../../packages/ui/src/index';

describe('display primitives, from the review of #649', () => {
  it('shows a dash for an empty Value or false inside a Fact', () => {
    render(
      <FactList layout="stacked">
        <Fact label="Subscribers">
          <Value format="compact" value={undefined} />
        </Fact>
        <Fact label="Archived">{false}</Fact>
        <Fact label="Count">
          <Value value={0} />
        </Fact>
      </FactList>,
    );

    const values = [...document.querySelectorAll('dd')].map((value) => value.textContent);

    expect(values).toEqual(['—', '—', '0']);
  });

  it('never puts a short masked secret in the DOM', () => {
    const { container } = render(<CopyValue mask value="7391" />);
    const { container: eight } = render(<CopyValue mask value="abcd7391" />);
    const { container: long } = render(<CopyValue mask value="sk_live_abcd7391" />);

    expect(container.innerHTML).not.toContain('7391');
    expect(eight.innerHTML).not.toContain('7391');
    expect(long.textContent).toContain('7391');
  });

  it('returns plain text unchanged instead of reading it as a date', () => {
    expect.soft(formatValue('Room 12', { locale: 'en-US' })).toBe('Room 12');
    expect.soft(formatValue('Order 5', { locale: 'en-US' })).toBe('Order 5');
    expect.soft(formatValue('Plan 2', { locale: 'en-US' })).toBe('Plan 2');
    expect.soft(formatValue('5%', { locale: 'en-US' })).toBe('5%');
    expect.soft(formatValue('+5', { locale: 'en-US' })).toBe('+5');
    expect
      .soft(formatValue('2026-03-04T10:00:00Z', { locale: 'en-US', now: new Date('2026-06-01') }))
      .toBe('Mar 4');
  });

  it('renders plain text in Value as text', () => {
    render(<Value locale="en-US" value="Plan 2" />);

    expect(screen.getByText('Plan 2').getAttribute('title')).toBeNull();
  });

  it('never shows a negative zero', () => {
    expect(formatValue(-0.001, { locale: 'en-US' })).toBe('0');
    expect(formatValue(-0.001, { format: 'currency', locale: 'en-US' })).toBe('$0.00');
    expect(formatValue(-0.00001, { format: 'percent', locale: 'en-US' })).toBe('0%');
    expect(formatValue(-0.001, { format: 'compact', locale: 'en-US' })).toBe('0');
    expect(formatValue(-5, { locale: 'en-US' })).toBe('-5');
  });

  it('draws no NaN coordinates in a Sparkline with a missing value', () => {
    const { container } = render(<Sparkline data={[3, Number.NaN, 5, 8]} />);

    expect(container.querySelector('polyline')?.getAttribute('points')).not.toMatch(/NaN/);
  });

  it('names the meter element', () => {
    render(<Meter aria-label="Fit score" value={50} />);

    expect(screen.getByRole('meter', { name: 'Fit score' })).toBeTruthy();
  });

  it('keeps a decimal when max is not 100', () => {
    render(<Meter label="Rating" max={5} tone="neutral" value={4.5} />);

    expect(screen.getByText('4.5 / 5')).toBeTruthy();
  });

  it('shows a new image after an earlier src failed', () => {
    const { container, rerender } = render(<Media alt="Clip" src="/broken.jpg" />);

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();

    rerender(<Media alt="Clip" src="/working.jpg" />);

    expect(container.querySelector('img')?.getAttribute('src')).toBe('/working.jpg');
  });

  it('fits the axis to percent fractions', () => {
    const { container } = render(
      <Chart
        format={{ format: 'percent', locale: 'en-US' }}
        labels={['Mon', 'Tue', 'Wed']}
        series={[{ name: 'Conversion', values: [0.02, 0.05, 0.08] }]}
      />,
    );

    const ticks = [...container.querySelectorAll('text[text-anchor="end"]')].map(
      (tick) => tick.textContent,
    );

    expect(ticks).toEqual(['0%', '2%', '4%', '6%', '8%']);
  });

  it('formats bar tooltips like line tooltips', () => {
    const props = {
      format: { format: 'currency' as const, locale: 'en-US' },
      labels: ['Mon'],
      series: [{ name: 'Revenue', values: [4120] }],
    };

    const { container: bar } = render(<Chart {...props} type="bar" />);
    const { container: line } = render(<Chart {...props} type="line" />);

    expect(line.querySelector('title')?.textContent).toBe('Mon · Revenue: $4,120');
    expect(bar.querySelector('title')?.textContent).toBe('Mon · Revenue: $4,120');
  });
});
