import { describe, expect, it } from 'vitest';

import {
  resolveCalendarDate,
  resolveCalendarMode,
} from '../../../../packages/next/src/views/Calendar/data.js';
import {
  getViewPreferenceKey,
  resolveViewColumnPreferences,
} from '../../../../packages/next/src/views/preferences.js';

describe('collection calendar', () => {
  it('resolves mode from URL, preference, then configuration', () => {
    expect(
      resolveCalendarMode({
        configuredModes: ['month', 'week'],
        preferenceMode: 'month',
        queryMode: 'week',
      }),
    ).toBe('week');
    expect(
      resolveCalendarMode({ configuredModes: ['month', 'week'], preferenceMode: 'week' }),
    ).toBe('week');
    expect(resolveCalendarMode({ configuredModes: ['day', 'week'] })).toBe('day');
  });

  it('resolves date from URL, preference, then today', () => {
    expect(
      resolveCalendarDate({
        preferenceDate: '2026-08-02',
        queryDate: '2026-09-06',
        today: '2026-09-01',
      }),
    ).toBe('2026-09-06');
    expect(resolveCalendarDate({ preferenceDate: '2026-08-02', today: '2026-09-01' })).toBe(
      '2026-08-02',
    );
    expect(resolveCalendarDate({ today: '2026-09-01' })).toBe('2026-09-01');
  });

  it('resolves columns from URL, preference, then configuration', () => {
    const preferenceColumns = [{ accessor: 'owner', active: true }];
    expect(
      resolveViewColumnPreferences({
        defaultFields: ['title'],
        preferenceColumns,
        queryColumns: '["status"]',
      }),
    ).toEqual([{ accessor: 'status', active: true }]);
    expect(resolveViewColumnPreferences({ defaultFields: ['title'], preferenceColumns })).toEqual(
      preferenceColumns,
    );
    expect(resolveViewColumnPreferences({ defaultFields: ['title'] })).toEqual([
      { accessor: 'title', active: true },
    ]);
    expect(getViewPreferenceKey('posts', 'schedule')).toBe('collection-posts-view-schedule');
  });
});
