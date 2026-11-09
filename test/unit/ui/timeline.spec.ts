import { describe, expect, it } from 'vitest';

import { getRangeWhere } from '../../../packages/ui/src/admin/views/Calendar/data.js';
import {
  formatTimelineRange,
  getDayAt,
  getItemDays,
  getTimelineRange,
  layoutTimelineBars,
  moveTimelineItem,
  resizeTimelineItem,
  stepTimelineDate,
} from '../../../packages/ui/src/timeline/core.js';

const LA = 'America/Los_Angeles';

describe('timeline range', () => {
  it('shows two weeks by day, eight weeks by week and three months by month', () => {
    const day = getTimelineRange({ date: '2026-06-17', scale: 'day', timeZone: LA });
    const week = getTimelineRange({ date: '2026-06-17', scale: 'week', timeZone: LA });
    const month = getTimelineRange({ date: '2026-06-17', scale: 'month', timeZone: LA });

    expect(day.days).toHaveLength(14);
    expect(day.days[0]).toBe('2026-06-14');
    expect(week.days).toHaveLength(56);
    expect(week.days[0]).toBe('2026-05-31');
    expect(month.days[0]).toBe('2026-06-01');
    expect(month.days.at(-1)).toBe('2026-08-31');
    expect(day.start).toBe('2026-06-14T07:00:00.000Z');
  });

  it('reads the range in the browser zone', () => {
    const range = getTimelineRange({
      date: '2026-06-14T03:00:00.000Z',
      scale: 'day',
      timeZone: LA,
    });

    expect(range.days[0]).toBe('2026-06-07');
  });

  it('steps a week by day, four weeks by week and a month by month', () => {
    const step = (scale: 'day' | 'month' | 'week', direction: 1 | -1) =>
      stepTimelineDate({ date: '2026-06-17', direction, scale, timeZone: 'UTC' }).slice(0, 10);

    expect(step('day', 1)).toBe('2026-06-24');
    expect(step('week', -1)).toBe('2026-05-20');
    expect(step('month', 1)).toBe('2026-07-17');
  });

  it('labels the range', () => {
    expect(formatTimelineRange(getTimelineRange({ date: '2026-06-17', scale: 'day' }))).toBe(
      'Jun 14 – Jun 27, 2026',
    );
    expect(formatTimelineRange(getTimelineRange({ date: '2026-12-20', scale: 'day' }))).toBe(
      'Dec 20, 2026 – Jan 2, 2027',
    );
  });
});

describe('timeline bars', () => {
  const range = getTimelineRange({ date: '2026-06-17', scale: 'day', timeZone: 'UTC' });

  it('reads a timed value in the zone and a date-only value on its UTC day', () => {
    const item = { end: '2026-06-20T12:00:00.000Z', id: '1', start: '2026-06-16T02:00:00.000Z' };

    expect(getItemDays(item, LA)).toEqual({ first: '2026-06-15', last: '2026-06-20' });
    expect(getItemDays(item, LA, { end: true, start: true })).toEqual({
      first: '2026-06-16',
      last: '2026-06-20',
    });
  });

  it('gives a one-date record one day, on whichever date it has', () => {
    expect(getItemDays({ id: '1', start: '2026-06-16T12:00:00.000Z' }, 'UTC')).toEqual({
      first: '2026-06-16',
      last: '2026-06-16',
    });
    expect(getItemDays({ end: '2026-06-20T12:00:00.000Z', id: '1' }, 'UTC')).toEqual({
      first: '2026-06-20',
      last: '2026-06-20',
    });
    expect(getItemDays({ id: '1' }, 'UTC')).toBeUndefined();
  });

  it('ends a timed bar at midnight on the day before', () => {
    expect(
      getItemDays(
        { end: '2026-06-18T00:00:00.000Z', id: '1', start: '2026-06-16T00:00:00.000Z' },
        'UTC',
      ),
    ).toEqual({ first: '2026-06-16', last: '2026-06-17' });
  });

  it('packs overlapping bars into rows and lets others share one', () => {
    const at = (day: number) => `2026-06-${String(day).padStart(2, '0')}T12:00:00.000Z`;
    const { bars, rows } = layoutTimelineBars(
      [
        { end: at(18), id: 'a', start: at(15) },
        { end: at(20), id: 'b', start: at(17) },
        { end: at(22), id: 'c', start: at(19) },
        { end: at(16), id: 'd', start: at(16) },
      ],
      range,
    );

    const row = (id: string) => bars.find((bar) => bar.item.id === id)?.row;

    expect(rows).toBe(2);
    expect(row('a')).toBe(0);
    expect(row('d')).toBe(1);
    expect(row('b')).toBe(1);
    expect(row('c')).toBe(0);
  });

  it('clips bars at the range and drops ones outside it', () => {
    const { bars } = layoutTimelineBars(
      [
        { end: '2026-06-16T12:00:00.000Z', id: 'left', start: '2026-06-01T12:00:00.000Z' },
        { end: '2026-07-30T12:00:00.000Z', id: 'right', start: '2026-06-26T12:00:00.000Z' },
        { end: '2026-06-02T12:00:00.000Z', id: 'gone', start: '2026-06-01T12:00:00.000Z' },
      ],
      range,
    );

    expect(
      bars.map(({ clippedEnd, clippedStart, first, item, last }) => [
        item.id,
        first,
        last,
        clippedStart,
        clippedEnd,
      ]),
    ).toEqual([
      ['left', 0, 2, true, false],
      ['right', 12, 13, false, true],
    ]);
  });

  it('maps a pointer to the day under it', () => {
    const track = { left: 100, width: 1400 };

    expect(getDayAt(100, track, 14)).toBe(0);
    expect(getDayAt(299, track, 14)).toBe(1);
    expect(getDayAt(2000, track, 14)).toBe(13);
    expect(getDayAt(0, track, 14)).toBe(0);
  });
});

describe('timeline move and resize', () => {
  const item = { end: '2026-06-18T17:30:00.000Z', id: '1', start: '2026-06-15T16:00:00.000Z' };

  it('moves both dates by whole days and keeps the time of day across a DST change', () => {
    expect(moveTimelineItem(item, 3, LA)).toMatchObject({
      end: '2026-06-21T17:30:00.000Z',
      start: '2026-06-18T16:00:00.000Z',
    });

    expect(moveTimelineItem({ id: '2', start: '2026-11-02T17:00:00.000Z' }, -2, LA)).toMatchObject({
      end: undefined,
      start: '2026-10-31T16:00:00.000Z',
    });
  });

  it('keeps date-only values at noon UTC', () => {
    expect(
      moveTimelineItem(
        { end: '2026-06-18T12:00:00.000Z', id: '1', start: '2026-06-15T12:00:00.000Z' },
        2,
        LA,
        { end: true, start: true },
      ),
    ).toMatchObject({ end: '2026-06-20T12:00:00.000Z', start: '2026-06-17T12:00:00.000Z' });
  });

  it('moves only the date a one-date record has', () => {
    expect(moveTimelineItem({ end: '2026-06-18T12:00:00.000Z', id: '1' }, 1, 'UTC')).toEqual({
      end: '2026-06-19T12:00:00.000Z',
      item: { end: '2026-06-18T12:00:00.000Z', id: '1' },
      start: undefined,
    });
  });

  it('drags one edge and never puts the end before the start', () => {
    expect(resizeTimelineItem(item, 'end', 2, 'UTC')).toMatchObject({
      end: '2026-06-20T17:30:00.000Z',
      start: item.start,
    });
    expect(resizeTimelineItem(item, 'start', -1, 'UTC')).toMatchObject({
      end: item.end,
      start: '2026-06-14T16:00:00.000Z',
    });
    expect(resizeTimelineItem(item, 'end', -10, 'UTC')).toMatchObject({
      end: item.start,
      start: item.start,
    });
    expect(resizeTimelineItem(item, 'start', 10, 'UTC')).toMatchObject({
      end: item.end,
      start: item.end,
    });
  });

  it('fills in a missing date from the free edge', () => {
    expect(
      resizeTimelineItem({ end: '2026-06-20T12:00:00.000Z', id: '1' }, 'start', -3, 'UTC'),
    ).toMatchObject({ end: '2026-06-20T12:00:00.000Z', start: '2026-06-17T12:00:00.000Z' });
    expect(
      resizeTimelineItem({ id: '1', start: '2026-06-12T09:00:00.000Z' }, 'end', 2, 'UTC', {
        end: true,
      }),
    ).toMatchObject({ end: '2026-06-14T12:00:00.000Z', start: '2026-06-12T09:00:00.000Z' });
  });
});

describe('range query', () => {
  const range = { end: '2026-06-28T00:00:00.000Z', start: '2026-06-14T00:00:00.000Z' };

  it('keeps the calendar query for records with a start', () => {
    expect(getRangeWhere({ end: 'endsAt', range, start: 'startsAt' })).toEqual({
      and: [
        { startsAt: { less_than_equal: range.end } },
        {
          or: [
            { endsAt: { greater_than_equal: range.start } },
            {
              and: [
                { endsAt: { exists: false } },
                { startsAt: { greater_than_equal: range.start } },
              ],
            },
          ],
        },
      ],
    });
    expect(getRangeWhere({ range, start: 'startsAt' })).toEqual({
      and: [
        { startsAt: { less_than_equal: range.end } },
        { startsAt: { greater_than_equal: range.start } },
      ],
    });
  });

  it('adds end-only records inside the range for the timeline, in one flat or', () => {
    expect(getRangeWhere({ end: 'endsAt', endOnly: true, range, start: 'startsAt' })).toEqual({
      or: [
        {
          and: [
            { startsAt: { less_than_equal: range.end } },
            { endsAt: { greater_than_equal: range.start } },
          ],
        },
        {
          and: [
            { endsAt: { exists: false } },
            { startsAt: { greater_than_equal: range.start } },
            { startsAt: { less_than_equal: range.end } },
          ],
        },
        {
          and: [
            { startsAt: { exists: false } },
            { endsAt: { greater_than_equal: range.start } },
            { endsAt: { less_than_equal: range.end } },
          ],
        },
      ],
    });
  });
});
