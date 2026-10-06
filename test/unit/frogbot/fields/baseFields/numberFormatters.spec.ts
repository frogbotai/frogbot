import { describe, expect, it } from 'vitest';

import {
  formatDuration,
  parseDuration,
} from '../../../../../packages/frogbot/src/fields/baseFields/duration/formatDuration.js';
import { formatPercent } from '../../../../../packages/frogbot/src/fields/baseFields/percent/formatPercent.js';

describe('formatPercent', () => {
  it.each([
    [{ value: 0.42 }, '42%'],
    [{ value: 0.42, locale: 'de-DE' }, '42\u00a0%'],
    [{ value: 0.42, precision: 2 }, '42.00%'],
    [{ value: -0.1 }, '-10%'],
    [{ value: 0 }, '0%'],
    [{ value: -0 }, '0%'],
    [{ value: -0.001 }, '0%'],
    [{ value: -0.00004, precision: 2 }, '0.00%'],
    [{ value: -0.006 }, '-1%'],
    [{ value: 1.5 }, '150%'],
    [{ value: 0.12345, precision: 8 }, '12.34500000%'],
  ])('formats %o', (args, expected) => {
    expect(formatPercent(args)).toBe(expected);
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, '0.5'])(
    'returns an empty string for %o',
    (value) => {
      expect(formatPercent({ value })).toBe('');
    },
  );
});

describe('formatDuration', () => {
  it.each([
    ['h:mm:ss', 225, '3:45'],
    ['h:mm:ss', 5400, '1:30:00'],
    ['h:mm:ss', 3723, '1:02:03'],
    ['h:mm:ss', 59.2, '1:00'],
    ['h:mm:ss', 0, '0:00'],
    ['h:mm:ss', -0, '0:00'],
    ['h:mm:ss', -225, '-3:45'],
    ['h:mm', 90, '0:02'],
    ['h:mm', -90, '-0:02'],
    ['h:mm', 5400, '1:30'],
    ['h:mm', 93600, '26:00'],
    ['h:mm', 0, '0:00'],
  ] as const)('formats %s %o as %s', (format, value, expected) => {
    expect(formatDuration({ format, value })).toBe(expected);
  });

  it('uses h:mm:ss by default', () => {
    expect(formatDuration({ value: 5400 })).toBe('1:30:00');
  });

  it.each([null, undefined, Number.NaN, Number.NEGATIVE_INFINITY, '5400'])(
    'returns an empty string for %o',
    (value) => {
      expect(formatDuration({ value })).toBe('');
    },
  );
});

describe('parseDuration', () => {
  it.each([
    ['h:mm', '90', 5400],
    ['h:mm', '1:30', 5400],
    ['h:mm', '1:7', 4020],
    ['h:mm', '-1:30', -5400],
    ['h:mm', '26:00', 93600],
    ['h:mm:ss', '90', 90],
    ['h:mm:ss', '1:30', 90],
    ['h:mm:ss', '1:02:03', 3723],
    ['h:mm:ss', '1:59:59', 7199],
    ['h:mm:ss', ' 3:45 ', 225],
    ['h:mm:ss', '0', 0],
  ] as const)('reads %s %o as %o seconds', (format, text, expected) => {
    expect(parseDuration({ format, text })).toBe(expected);
  });

  it('uses h:mm:ss by default', () => {
    expect(parseDuration({ text: '1:30' })).toBe(90);
  });

  it('reads -0 as 0', () => {
    expect(Object.is(parseDuration({ text: '-0:00' }), 0)).toBe(true);
  });

  it.each(['', '   '])('reads blank text %o as null', (text) => {
    expect(parseDuration({ text })).toBeNull();
  });

  it.each([
    ['h:mm', '1:02:03'],
    ['h:mm', '1:75'],
    ['h:mm:ss', '1:75'],
    ['h:mm:ss', '1:60'],
    ['h:mm:ss', '1:00:60'],
    ['h:mm:ss', '1.5'],
    ['h:mm:ss', '1 : 30'],
    ['h:mm:ss', '1:'],
    ['h:mm:ss', ':30'],
    ['h:mm:ss', '1:2:3:4'],
    ['h:mm:ss', '1:030'],
    ['h:mm:ss', '+1:30'],
    ['h:mm:ss', '--1'],
    ['h:mm:ss', 'abc'],
    ['h:mm:ss', '99999999999999999999'],
  ] as const)('rejects %s %o', (format, text) => {
    expect(parseDuration({ format, text })).toBeUndefined();
  });
});
