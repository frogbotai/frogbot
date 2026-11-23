import type { ClientField } from 'payload';
import { describe, expect, it } from 'vitest';

import {
  formatShortDate,
  isShortDate,
  shortDateDisplayFormat,
} from '../../../../../packages/ui/src/admin/fields/shortDate.js';

const now = new Date(2026, 10, 23, 9);

describe('formatShortDate', () => {
  it('writes a date this year as month and day', () => {
    expect(formatShortDate(new Date(2026, 10, 24, 20, 13).toISOString(), { now })).toBe('Nov 24');
  });

  it('adds the year to a date in another year', () => {
    expect(formatShortDate(new Date(2027, 0, 3), { now })).toBe('Jan 3, 2027');
    expect(formatShortDate(new Date(2025, 11, 31), { now })).toBe('Dec 31, 2025');
  });

  it('returns undefined for no date or an invalid one', () => {
    expect(formatShortDate(null, { now })).toBeUndefined();
    expect(formatShortDate('', { now })).toBeUndefined();
    expect(formatShortDate('not a date', { now })).toBeUndefined();
  });
});

describe('shortDateDisplayFormat', () => {
  it('matches formatShortDate for the picker', () => {
    expect(shortDateDisplayFormat(new Date(2026, 4, 1), now)).toBe('MMM d');
    expect(shortDateDisplayFormat(new Date(2027, 4, 1), now)).toBe('MMM d, yyyy');
    expect(shortDateDisplayFormat(undefined, now)).toBe('MMM d');
  });
});

describe('isShortDate', () => {
  const date = (admin?: object) => ({ name: 'due', type: 'date', admin }) as ClientField;

  it('takes day-only dates with no display format of their own', () => {
    expect(isShortDate(date())).toBe(true);
    expect(isShortDate(date({ date: { pickerAppearance: 'dayOnly' } }))).toBe(true);
  });

  it('leaves dates with a time or their own format, and other fields, alone', () => {
    expect(isShortDate(date({ date: { pickerAppearance: 'dayAndTime' } }))).toBe(false);
    expect(isShortDate(date({ date: { displayFormat: 'd MMM yyyy' } }))).toBe(false);
    expect(isShortDate({ name: 'title', type: 'text' })).toBe(false);
  });
});
