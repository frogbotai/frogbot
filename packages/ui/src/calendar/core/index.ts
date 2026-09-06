import { TZDate } from '@date-fns/tz';
import {
  addDays,
  addMinutes,
  differenceInCalendarDays,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export type CalendarMode = 'day' | 'month' | 'week';

export type CalendarRange = {
  end: string;
  start: string;
  timeZone: string;
};

export type CalendarEvent = {
  color?: string;
  end?: string;
  id: string;
  start: string;
};

export type CalendarCellEvent<T extends CalendarEvent = CalendarEvent> = {
  cell: string;
  end: string;
  event: T;
  startsBeforeCell: boolean;
  start: string;
  endsAfterCell: boolean;
};

export type CalendarLane<T extends CalendarEvent = CalendarEvent> = {
  event: T;
  lane: number;
  laneCount: number;
};

export function getVisibleRange({
  date,
  mode,
  timeZone = 'UTC',
  weekStartsOn = 0,
}: {
  date: string;
  mode: CalendarMode;
  timeZone?: string;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}): CalendarRange {
  const zonedDate = new TZDate(date, timeZone);
  let start = startOfDay(zonedDate);
  let end = addDays(start, 1);

  if (mode === 'week') {
    start = startOfWeek(zonedDate, { weekStartsOn });
    end = addDays(start, 7);
  }

  if (mode === 'month') {
    start = startOfWeek(startOfMonth(zonedDate), { weekStartsOn });
    end = addDays(start, 42);
  }

  return { end: end.toISOString(), start: start.toISOString(), timeZone };
}

export function getRangeDays(range: CalendarRange, count: number): Date[] {
  const start = new TZDate(range.start, range.timeZone);
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

export function expandToCells<T extends CalendarEvent>(
  events: T[],
  range: CalendarRange,
): CalendarCellEvent<T>[] {
  const rangeStart = new TZDate(range.start, range.timeZone);
  const rangeEnd = new TZDate(range.end, range.timeZone);
  const cells: CalendarCellEvent<T>[] = [];

  for (const event of events) {
    const eventStart = new TZDate(event.start, range.timeZone);
    const eventEnd = new TZDate(event.end ?? event.start, range.timeZone);
    const clippedStart = new TZDate(
      Math.max(eventStart.getTime(), rangeStart.getTime()),
      range.timeZone,
    );
    const clippedEnd = new TZDate(Math.min(eventEnd.getTime(), rangeEnd.getTime()), range.timeZone);

    if (clippedEnd < rangeStart || clippedStart >= rangeEnd || clippedEnd < clippedStart) continue;

    const firstDay = startOfDay(clippedStart);
    const lastInstant =
      clippedEnd.getTime() > clippedStart.getTime() ? addMinutes(clippedEnd, -1) : clippedEnd;
    const dayCount = differenceInCalendarDays(startOfDay(lastInstant), firstDay);

    for (let offset = 0; offset <= dayCount; offset++) {
      const dayStart = addDays(firstDay, offset);
      const dayEnd = addDays(dayStart, 1);
      cells.push({
        cell: format(dayStart, 'yyyy-MM-dd'),
        end: new Date(Math.min(clippedEnd.getTime(), dayEnd.getTime())).toISOString(),
        endsAfterCell: eventEnd.getTime() > dayEnd.getTime(),
        event,
        start: new Date(Math.max(clippedStart.getTime(), dayStart.getTime())).toISOString(),
        startsBeforeCell: eventStart.getTime() < dayStart.getTime(),
      });
    }
  }

  return cells;
}

export function layoutLanes<T extends CalendarEvent>(events: T[]): CalendarLane<T>[] {
  const sorted = [...events].sort(
    (a, b) =>
      Date.parse(a.start) - Date.parse(b.start) ||
      Date.parse(b.end ?? b.start) - Date.parse(a.end ?? a.start),
  );
  const result: CalendarLane<T>[] = [];

  for (let groupStart = 0; groupStart < sorted.length;) {
    let groupEnd = groupStart + 1;
    let latestEnd = Date.parse(sorted[groupStart].end ?? sorted[groupStart].start);

    while (groupEnd < sorted.length && Date.parse(sorted[groupEnd].start) < latestEnd) {
      latestEnd = Math.max(latestEnd, Date.parse(sorted[groupEnd].end ?? sorted[groupEnd].start));
      groupEnd++;
    }

    const laneEnds: number[] = [];
    const group = sorted.slice(groupStart, groupEnd).map((event) => {
      const start = Date.parse(event.start);
      let lane = laneEnds.findIndex((end) => end <= start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = Date.parse(event.end ?? event.start);
      return { event, lane };
    });

    result.push(...group.map(({ event, lane }) => ({ event, lane, laneCount: laneEnds.length })));
    groupStart = groupEnd;
  }

  return result;
}

export function snapTo(date: string, minutes: number): string {
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new RangeError('minutes must be a positive integer');
  }
  const interval = minutes * 60_000;
  return new Date(Math.round(Date.parse(date) / interval) * interval).toISOString();
}
