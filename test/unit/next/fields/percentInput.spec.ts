import { describe, expect, it } from 'vitest';

import {
  parsePercentInput,
  percentToInput,
} from '../../../../packages/next/src/fields/Percent/percentInput.js';

describe('percentToInput', () => {
  it.each([
    [0.07, '7'],
    [0.425, '42.5'],
    [1, '100'],
    [-0.1, '-10'],
    [0, '0'],
    [-0, '0'],
    [0.0001, '0.01'],
    [1e-7, '0.00001'],
    [0.123456789, '12.3456789'],
  ])('shows %s as %j', (value, text) => {
    expect(percentToInput(value)).toBe(text);
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, '0.5'])(
    'shows nothing for %s',
    (value) => {
      expect(percentToInput(value)).toBe('');
    },
  );
});

describe('parsePercentInput', () => {
  it.each([
    ['7', 0.07],
    ['42.5', 0.425],
    ['42%', 0.42],
    ['-10', -0.1],
    ['.5', 0.005],
    ['7.', 0.07],
    [' 42.5 % ', 0.425],
  ])('reads %j as %s', (text, value) => {
    expect(parsePercentInput(text)).toBe(value);
  });

  it('reads negative zero as zero', () => {
    expect(Object.is(parsePercentInput('-0'), 0)).toBe(true);
  });

  it.each(['', '   '])('reads blank %j as null', (text) => {
    expect(parsePercentInput(text)).toBeNull();
  });

  it.each(['abc', '4 2', '1,5', '1e3', '--1', '.'])('cannot read %j', (text) => {
    expect(parsePercentInput(text)).toBeUndefined();
  });
});
