import { format } from 'date-fns';
import { describe, expect, it } from 'vitest';

import {
  expandToCells,
  getRangeDays,
  getVisibleRange,
  layoutLanes,
  snapTo,
} from '../../../packages/ui/src/calendar/core/index.js';
import {
  createCalendarRange,
  getCalendarPointerPosition,
  isCalendarNoopDrop,
  moveCalendarEvent,
  resizeCalendarEvent,
  resolveCalendarDrop,
} from '../../../packages/ui/src/calendar/useCalendar.js';

describe('calendar core', () => {
  it('builds a DST-aware week range', () => {
    expect(
      getVisibleRange({
        date: '2026-03-11T12:00:00Z',
        mode: 'week',
        timeZone: 'America/New_York',
        weekStartsOn: 0,
      }),
    ).toEqual({
      start: '2026-03-08T00:00:00.000-05:00',
      end: '2026-03-15T00:00:00.000-04:00',
      timeZone: 'America/New_York',
    });
  });

  it('returns six complete weeks for a month', () => {
    expect(
      getVisibleRange({ date: '2026-09-15T12:00:00Z', mode: 'month', weekStartsOn: 1 }),
    ).toEqual({
      start: '2026-08-31T00:00:00.000+00:00',
      end: '2026-10-12T00:00:00.000+00:00',
      timeZone: 'UTC',
    });
  });

  it('keeps range days in the calendar timezone', () => {
    const range = getVisibleRange({ date: '2026-09-09T12:00:00Z', mode: 'month' });
    expect(getRangeDays(range, 2).map((day) => format(day, 'yyyy-MM-dd'))).toEqual([
      '2026-08-30',
      '2026-08-31',
    ]);
  });

  it('expands and clips multi-day events into visible cells', () => {
    const range = getVisibleRange({ date: '2026-09-06T12:00:00Z', mode: 'week' });
    const cells = expandToCells(
      [{ id: 'a', start: '2026-09-05T20:00:00Z', end: '2026-09-08T06:00:00Z' }],
      range,
    );

    expect(
      cells.map(({ cell, endsAfterCell, startsBeforeCell }) => [
        cell,
        startsBeforeCell,
        endsAfterCell,
      ]),
    ).toEqual([
      ['2026-09-06', true, true],
      ['2026-09-07', true, true],
      ['2026-09-08', true, false],
    ]);
  });

  it('assigns the minimum lanes to overlap groups', () => {
    const lanes = layoutLanes([
      { id: 'a', start: '2026-09-06T11:00:00Z', end: '2026-09-06T12:00:00Z' },
      { id: 'b', start: '2026-09-06T11:15:00Z', end: '2026-09-06T12:15:00Z' },
      { id: 'c', start: '2026-09-06T12:00:00Z', end: '2026-09-06T13:00:00Z' },
      { id: 'd', start: '2026-09-06T14:00:00Z', end: '2026-09-06T15:00:00Z' },
    ]);

    expect(lanes.map(({ event, lane, laneCount }) => [event.id, lane, laneCount])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 2],
      ['d', 0, 1],
    ]);
  });

  it('snaps instants to the nearest interval', () => {
    expect(snapTo('2026-03-08T06:53:00Z', 15)).toBe('2026-03-08T07:00:00.000Z');
    expect(() => snapTo('2026-03-08T06:53:00Z', 0)).toThrow(RangeError);
  });
});

describe('useCalendar interactions', () => {
  const event = {
    end: '2026-09-06T11:30:00.000Z',
    id: 'a',
    start: '2026-09-06T10:00:00.000Z',
  };

  it('moves an event while preserving its duration', () => {
    expect(
      moveCalendarEvent(event, {
        end: '2026-09-07T15:30:00.000Z',
        key: '2026-09-07',
        start: '2026-09-07T14:00:00.000Z',
      }),
    ).toEqual({
      end: '2026-09-07T15:30:00.000Z',
      event,
      start: '2026-09-07T14:00:00.000Z',
    });
  });

  it('clamps resize to one snapped interval', () => {
    expect(
      resizeCalendarEvent({
        edge: 'start',
        event,
        instant: '2026-09-06T12:00:00.000Z',
        snap: 30,
      }),
    ).toEqual({
      end: event.end,
      event,
      start: '2026-09-06T11:00:00.000Z',
    });
    expect(
      resizeCalendarEvent({
        edge: 'end',
        event,
        instant: '2026-09-06T09:00:00.000Z',
        snap: 30,
      }).end,
    ).toBe('2026-09-06T10:30:00.000Z');
  });

  it('creates a snapped range in either pointer direction', () => {
    expect(createCalendarRange('2026-09-06T11:08:00.000Z', '2026-09-06T10:06:00.000Z', 15)).toEqual(
      {
        end: '2026-09-06T11:15:00.000Z',
        start: '2026-09-06T10:00:00.000Z',
      },
    );
  });

  it('treats the source slot as a no-op', () => {
    expect(
      isCalendarNoopDrop(event, {
        end: event.end,
        key: '2026-09-06',
        start: event.start,
      }),
    ).toBe(true);
    expect(
      isCalendarNoopDrop(event, {
        end: '2026-09-06T12:00:00.000Z',
        key: '2026-09-06',
        start: '2026-09-06T10:30:00.000Z',
      }),
    ).toBe(false);
  });

  it('resolves a drop from the final drag event without a prior placement', () => {
    const point = getCalendarPointerPosition({
      activatorEvent: { clientX: 10, clientY: 20 } as PointerEvent,
      delta: { x: 30, y: 40 },
    });

    expect(
      resolveCalendarDrop(
        {
          slotAt: (clientX, clientY) => ({
            end: '2026-09-10T00:30:00.000Z',
            key: `${clientX}:${clientY}`,
            start: '2026-09-10T00:00:00.000Z',
          }),
        },
        point,
      ),
    ).toEqual({
      end: '2026-09-10T00:30:00.000Z',
      key: '40:60',
      start: '2026-09-10T00:00:00.000Z',
    });
  });
});
