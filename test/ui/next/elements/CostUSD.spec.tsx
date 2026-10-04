import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const field = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock('@payloadcms/ui', () => ({
  FieldLabel: ({ label }: { label?: string }) => <label>{label}</label>,
  useField: () => ({ value: field.value }),
}));

const { CostUSDCell, CostUSDField, formatCostUSD } =
  await import('../../../../packages/next/src/elements/CostUSD/index.client.js');

describe('formatCostUSD', () => {
  it.each([
    [3.25, '$3.25'],
    [1234.5, '$1,234.50'],
    [0.016455, '$0.02'],
    [1000000, '$1,000,000.00'],
    [0.01, '$0.01'],
    [0.00017270000000000002, '$0.000173'],
    [0.0034, '$0.0034'],
    [0.005, '$0.005'],
    [0.000000123456, '$0.000000123'],
    [0.009996, '$0.01'],
    [0.0099949, '$0.00999'],
    [0, '$0.00'],
    [-0, '$0.00'],
    [null, '$0.00'],
    [undefined, '$0.00'],
    [Number.NaN, '$0.00'],
    [Number.POSITIVE_INFINITY, '$0.00'],
    [Number.NEGATIVE_INFINITY, '$0.00'],
    ['0.5', '$0.00'],
    [-0.5, '-$0.50'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatCostUSD(value)).toBe(expected);
  });
});

describe('CostUSDCell', () => {
  it('renders a sub-cent cost in the shared format', () => {
    render(<CostUSDCell cellData={0.00017270000000000002} />);

    expect(screen.getByText('$0.000173')).toBeTruthy();
  });

  it('renders zero dollars for a missing cost', () => {
    render(<CostUSDCell cellData={undefined} />);

    expect(screen.getByText('$0.00')).toBeTruthy();
  });
});

describe('CostUSDField', () => {
  beforeEach(() => {
    field.value = 0.016455;
  });

  it('renders the label and the formatted cost without an input', () => {
    const { container } = render(<CostUSDField field={{ label: 'Cost (USD)' }} path="costUSD" />);

    expect(screen.getByText('Cost (USD)')).toBeTruthy();
    expect(screen.getByText('$0.02')).toBeTruthy();
    expect(container.querySelector('input')).toBeNull();
  });
});
