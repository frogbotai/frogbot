import { describe, expect, it } from 'vitest';

import { formatMoney } from '../../../../../packages/frogbot/src/fields/baseFields/money/formatMoney.js';

describe('formatMoney automatic precision', () => {
  it.each([
    [3.25, 'USD', '$3.25'],
    [1234.5, 'USD', '$1,234.50'],
    [0.016455, 'USD', '$0.02'],
    [0.00017270000000000002, 'USD', '$0.000173'],
    [0.009996, 'USD', '$0.01'],
    [0, 'USD', '$0.00'],
    [-3.25, 'USD', '-$3.25'],
    [-0.000173, 'USD', '-$0.000173'],
    [1234.5, 'JPY', '¥1,235'],
    [0.5, 'JPY', '¥0.5'],
    [1.5, 'BHD', 'BHD\u00a01.500'],
    [0.0004, 'BHD', 'BHD\u00a00.0004'],
  ])('formats %s %s as %s', (value, currency, expected) => {
    expect(formatMoney({ value, currency })).toBe(expected);
  });

  it('formats in the given locale', () => {
    expect(formatMoney({ value: 1234.5, locale: 'de-DE' })).toBe('1.234,50\u00a0$');
  });

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
    [-0.5, '-$0.50'],
  ])('keeps the previous cost format for %s', (value, expected) => {
    expect(formatMoney({ value })).toBe(expected);
  });
});

describe('formatMoney fixed precision', () => {
  it('shows exactly the given number of decimals', () => {
    expect(formatMoney({ value: 1.5, precision: 4 })).toBe('$1.5000');
  });

  it('rounds to whole units with precision 0', () => {
    expect(formatMoney({ value: 1234.5, precision: 0 })).toBe('$1,235');
  });

  it('shows a small amount as zero with precision 2', () => {
    expect(formatMoney({ value: 0.000173, precision: 2 })).toBe('$0.00');
  });

  it('shows a small negative amount that rounds to zero without a sign', () => {
    expect(formatMoney({ value: -0.001, precision: 2 })).toBe('$0.00');
  });

  it('keeps the sign of a negative amount that does not round to zero', () => {
    expect(formatMoney({ value: -0.006, precision: 2 })).toBe('-$0.01');
  });
});

describe('formatMoney empty values', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['a numeric string', '0.5'],
  ])('returns an empty string for %s', (_label, value) => {
    expect(formatMoney({ value })).toBe('');
  });
});
