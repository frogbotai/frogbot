import type { I18nClient } from '@payloadcms/translations';
import { enUS } from 'date-fns/locale/en-US';
import type { ClientField } from 'payload';
import { describe, expect, it } from 'vitest';

import {
  buildSummaryRequest,
  formatSummary,
  getSummaryLabel,
  readSummaryChoices,
  resolveSummary,
  type SummaryColumn,
} from '../../../../../packages/ui/src/admin/views/List/summary/summary.js';

const number: SummaryColumn = { kind: 'number', operations: ['count', 'sum', 'avg', 'min', 'max'] };
const date: SummaryColumn = { kind: 'date', operations: ['count', 'min', 'max'] };
const other: SummaryColumn = { kind: 'other', operations: ['count'] };

const i18n = { language: 'en', dateFNS: enUS, t: (key: string) => key } as unknown as I18nClient;

const money = {
  name: 'amount',
  type: 'number',
  admin: { custom: { frogbot: { kind: { type: 'money', currency: 'EUR', precision: 'auto' } } } },
} as unknown as ClientField;

const percent = {
  name: 'odds',
  type: 'number',
  admin: { custom: { frogbot: { kind: { type: 'percent', precision: 1 } } } },
} as unknown as ClientField;

describe('list summary', () => {
  it('reads only well-formed saved choices from the view preference', () => {
    expect(
      readSummaryChoices({
        columns: [],
        summary: { amount: 'avg', name: 'none', bad: 'median', worse: 3 },
      }),
    ).toEqual({ amount: 'avg', name: 'none' });

    expect(readSummaryChoices(undefined)).toEqual({});
    expect(readSummaryChoices({ summary: ['amount'] })).toEqual({});
  });

  it('prefers the saved choice, falls back to the config default, and drops what a column refuses', () => {
    expect(
      resolveSummary({
        columns: { amount: number, closedAt: date, name: other, stage: other },
        defaults: { amount: 'sum', name: 'count', closedAt: 'max' },
        saved: { amount: 'avg', name: 'none', stage: 'sum' },
      }),
    ).toEqual({ amount: 'avg', closedAt: 'max' });
  });

  it('leaves out columns the server did not resolve, such as a field with access.read', () => {
    expect(
      resolveSummary({ columns: { amount: number }, defaults: { margin: 'sum' }, saved: {} }),
    ).toEqual({});
  });

  it('builds one draft request for the visible columns, with the list where', () => {
    const where = { stage: { equals: 'won' } };

    expect(
      buildSummaryRequest({
        paths: ['name', 'amount', 'closedAt'],
        summary: { name: 'count', amount: 'sum', closedAt: 'min', hidden: 'count' },
        where,
      }),
    ).toEqual({
      draft: true,
      values: { name: { count: true }, amount: { sum: 'amount' }, closedAt: { min: 'closedAt' } },
      where,
    });
  });

  it('sends no request when no visible column has a total, and no empty where', () => {
    expect(buildSummaryRequest({ paths: ['name'], summary: {}, where: undefined })).toBeUndefined();

    expect(buildSummaryRequest({ paths: ['name'], summary: { name: 'count' }, where: {} })).toEqual(
      { draft: true, values: { name: { count: true } } },
    );
  });

  it('labels date extremes Earliest and Latest', () => {
    expect(getSummaryLabel('min', 'date')).toBe('Earliest');
    expect(getSummaryLabel('max', 'date')).toBe('Latest');
    expect(getSummaryLabel('min', 'number')).toBe('Min');
    expect(getSummaryLabel('avg', 'number')).toBe('Average');
  });

  describe('formatting', () => {
    const format = (args: Partial<Parameters<typeof formatSummary>[0]>) =>
      formatSummary({
        dateFormat: 'yyyy-MM-dd',
        i18n,
        kind: 'number',
        operation: 'sum',
        value: null,
        ...args,
      });

    it('renders nothing for no value and 0 as 0', () => {
      expect(format({ value: null })).toBe('');
      expect(format({ value: undefined, operation: 'avg' })).toBe('');
      expect(format({ value: 0 })).toBe('0');
      expect(format({ value: 0, operation: 'count' })).toBe('0');
    });

    it('formats counts and plain numbers in the admin language', () => {
      expect(format({ value: 12345, operation: 'count', field: money })).toBe('12,345');
      expect(format({ value: 1234.5 })).toBe('1,234.5');
      expect(format({ value: 1234.5, i18n: { ...i18n, language: 'de' } })).toBe('1.234,5');
    });

    it("uses the money and percent cells' formatters with the field's currency and precision", () => {
      expect(format({ value: 1500, field: money })).toBe('€1,500.00');
      expect(format({ value: 1000 / 3, operation: 'avg', field: money })).toBe('€333.33');
      expect(format({ value: 0.4567, operation: 'avg', field: percent })).toBe('45.7%');
    });

    it("formats date extremes with the field's display format, else the admin's", () => {
      const closedAt = {
        name: 'closedAt',
        type: 'date',
        admin: { date: { displayFormat: 'dd/MM/yyyy' } },
      } as unknown as ClientField;

      expect(
        format({
          kind: 'date',
          operation: 'max',
          value: '2026-01-05T12:00:00.000Z',
          field: closedAt,
        }),
      ).toBe('05/01/2026');

      expect(format({ kind: 'date', operation: 'min', value: '2026-01-05T12:00:00.000Z' })).toBe(
        '2026-01-05',
      );
    });
  });
});
