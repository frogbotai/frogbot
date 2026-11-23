import type { FlattenedField } from 'payload';
import { describe, expect, it } from 'vitest';

import {
  formatRowDate,
  pickRowFacts,
} from '../../../../../packages/ui/src/admin/widgets/CollectionQuery/rows.js';

const fields = [
  { name: 'name', type: 'text' },
  { name: 'company', type: 'relationship' },
  { name: 'stage', type: 'select', options: [] },
  { name: 'tags', type: 'select', hasMany: true, options: [] },
  { name: 'amount', type: 'number' },
  { name: 'closeDate', type: 'date' },
] as unknown as FlattenedField[];

describe('pickRowFacts', () => {
  it("takes the first select and number from the list view's columns", () => {
    const facts = pickRowFacts({
      fields,
      sortField: 'closeDate',
      titleField: 'name',
      views: [
        { type: 'board', defaultFields: ['name', 'amount'] },
        {
          type: 'list',
          defaultFields: ['name', 'company', 'tags', 'stage', 'amount', 'closeDate'],
        },
      ],
    });

    expect(facts.map(({ field, kind }) => [field.name, kind])).toEqual([
      ['stage', 'select'],
      ['amount', 'number'],
    ]);
  });

  it('skips the title and sort fields and shows nothing without columns', () => {
    expect(
      pickRowFacts({
        fields,
        sortField: 'amount',
        titleField: 'name',
        views: [{ type: 'list', defaultFields: ['name', 'amount'] }],
      }),
    ).toEqual([]);
    expect(pickRowFacts({ fields, titleField: 'name', views: [] })).toEqual([]);
  });
});

describe('formatRowDate', () => {
  const now = new Date(2026, 10, 23, 15, 0);

  it('reads a due date as Today, Tomorrow, then a short date', () => {
    expect(
      formatRowDate({ field: 'dueDate', locale: 'en-US', now, value: '2026-11-23' }),
    ).toMatchObject({ label: 'Today', overdue: false });
    expect(
      formatRowDate({ field: 'dueDate', locale: 'en-US', now, value: '2026-11-24' })?.label,
    ).toBe('Tomorrow');
    expect(
      formatRowDate({ field: 'dueDate', locale: 'en-US', now, value: '2026-12-04' })?.label,
    ).toBe('Dec 4');
    expect(
      formatRowDate({ field: 'dueDate', locale: 'en-US', now, value: '2027-01-04' })?.label,
    ).toBe('Jan 4, 2027');
  });

  it('marks a past due date overdue', () => {
    expect(
      formatRowDate({ field: 'dueDate', locale: 'en-US', now, value: '2026-11-22' }),
    ).toMatchObject({ label: 'Yesterday', overdue: true });
    expect(
      formatRowDate({ field: 'dueDate', locale: 'en-US', now, value: '2026-11-02' }),
    ).toMatchObject({ label: 'Nov 2', overdue: true });
  });

  it('reads record timestamps as time ago, never overdue', () => {
    const value = new Date(2026, 10, 23, 13, 0).toISOString();

    expect(formatRowDate({ field: 'updatedAt', locale: 'en-US', now, value })).toMatchObject({
      label: '2 hr. ago',
      overdue: false,
    });
  });

  it('shows nothing for empty or invalid values', () => {
    expect(formatRowDate({ field: 'dueDate', now, value: null })).toBeNull();
    expect(formatRowDate({ field: 'dueDate', now, value: 'soon' })).toBeNull();
  });
});
