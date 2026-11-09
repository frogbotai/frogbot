import { TZDate } from '@date-fns/tz';
import { addDays, addMonths, format, startOfMonth, startOfWeek } from 'date-fns';

import { dayKey, parseCalendarDate } from '../calendar/core/index.js';
import { moveCalendarEvent } from '../calendar/useCalendar.js';

export type TimelineScale = 'day' | 'month' | 'week';

export const TIMELINE_SCALES: TimelineScale[] = ['week', 'month', 'day'];

/** The narrowest a day may get at each scale, in px; wider screens stretch the days to fit. */
export const TIMELINE_DAY_WIDTH: Record<TimelineScale, number> = { day: 72, month: 12, week: 28 };

/** The days a timeline shows, as `yyyy-MM-dd` keys in its zone, and the instants around them. */
export type TimelineRange = {
  days: string[];
  end: string;
  start: string;
  timeZone: string;
};

/** A record on the timeline. Either date may be missing, but not both. */
export type TimelineItem = {
  color?: string;
  end?: string;
  id: string;
  start?: string;
};

/** Which of an item's dates are date-only values, stored at 12:00 UTC and read on their UTC day. */
export type TimelineDateOnly = { end?: boolean; start?: boolean };

/** An item's first and last day, inclusive, as indexes into the range's days. */
export type TimelineSpan = { first: number; last: number };

export type TimelineBar<T extends TimelineItem = TimelineItem> = TimelineSpan & {
  /** The bar starts before the visible range. */
  clippedStart: boolean;
  /** The bar ends after the visible range. */
  clippedEnd: boolean;
  item: T;
  row: number;
};

export type TimelineEdge = 'end' | 'start';

export type TimelineChange<T extends TimelineItem = TimelineItem> = {
  end?: string;
  item: T;
  start?: string;
};

function keyOf(value: string, dateOnly: boolean | undefined, timeZone: string): string {
  return dayKey(value, dateOnly ? 'UTC' : timeZone);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function shiftKey(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The days a scale shows around `date`: two weeks from its week by day, eight weeks from two weeks
 * before its week by week, and three months from its month by month.
 */
export function getTimelineRange({
  date,
  scale,
  timeZone = 'UTC',
  weekStartsOn = 0,
}: {
  date: string;
  scale: TimelineScale;
  timeZone?: string;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}): TimelineRange {
  const zoned = parseCalendarDate(date, timeZone);
  const week = startOfWeek(zoned, { weekStartsOn });
  const start =
    scale === 'month' ? startOfMonth(zoned) : scale === 'week' ? addDays(week, -14) : week;

  const end = scale === 'month' ? addMonths(start, 3) : addDays(start, scale === 'week' ? 56 : 14);

  const days: string[] = [];

  for (let day = start; day < end; day = addDays(day, 1)) days.push(format(day, 'yyyy-MM-dd'));

  return {
    days,
    end: new Date(end.getTime()).toISOString(),
    start: new Date(start.getTime()).toISOString(),
    timeZone,
  };
}

/** The date one step before or after `date`: a week by day, four weeks by week, a month by month. */
export function stepTimelineDate({
  date,
  direction,
  scale,
  timeZone = 'UTC',
}: {
  date: string;
  direction: 1 | -1;
  scale: TimelineScale;
  timeZone?: string;
}): string {
  const zoned = parseCalendarDate(date, timeZone);
  const next =
    scale === 'month'
      ? addMonths(zoned, direction)
      : addDays(zoned, direction * (scale === 'week' ? 28 : 7));

  return new Date(next.getTime()).toISOString();
}

const labelFormats = {
  long: new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  }),
  short: new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
};

/** The header label for a range, such as `Jun 14 – Jun 27, 2026`. */
export function formatTimelineRange(range: TimelineRange): string {
  const first = range.days[0];
  const last = range.days.at(-1) ?? first;
  const from = labelFormats[first.slice(0, 4) === last.slice(0, 4) ? 'short' : 'long'];

  return `${from.format(new Date(`${first}T12:00:00Z`))} – ${labelFormats.long.format(new Date(`${last}T12:00:00Z`))}`;
}

/**
 * An item's first and last day as `yyyy-MM-dd`. A record with one date is one day long on that
 * date. A timed end at midnight belongs to the day before, as in the calendar, with or without a
 * start.
 */
export function getItemDays(
  item: TimelineItem,
  timeZone: string,
  dateOnly: TimelineDateOnly = {},
): { first: string; last: string } | undefined {
  const start = item.start ? keyOf(item.start, dateOnly.start, timeZone) : undefined;
  const endValue =
    item.end && !dateOnly.end && (!item.start || Date.parse(item.end) > Date.parse(item.start))
      ? new Date(Date.parse(item.end) - 60_000).toISOString()
      : item.end;

  const end = endValue ? keyOf(endValue, dateOnly.end, timeZone) : undefined;
  const first = start ?? end;
  const last = end ?? start;

  if (!first || !last) return undefined;

  return last < first ? { first, last: first } : { first, last };
}

/** Places items on the range and packs each into the first row where it overlaps nothing. */
export function layoutTimelineBars<T extends TimelineItem>(
  items: T[],
  range: TimelineRange,
  dateOnly: TimelineDateOnly = {},
): { bars: TimelineBar<T>[]; rows: number } {
  const origin = range.days[0];
  const count = range.days.length;
  const placed = items.flatMap((item) => {
    const days = getItemDays(item, range.timeZone, dateOnly);
    if (!days) return [];
    const first = daysBetween(origin, days.first);
    const last = daysBetween(origin, days.last);
    if (last < 0 || first >= count) return [];

    return [{ first, item, last }];
  });

  placed.sort((a, b) => a.first - b.first || b.last - a.last);

  const rowEnds: number[] = [];
  const bars = placed.map(({ first, item, last }) => {
    let row = rowEnds.findIndex((end) => end < first);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = last;

    return {
      clippedEnd: last >= count,
      clippedStart: first < 0,
      first: Math.max(0, first),
      item,
      last: Math.min(count - 1, last),
      row,
    };
  });

  return { bars, rows: rowEnds.length };
}

/** The day index under a pointer, clamped to the track. */
export function getDayAt(clientX: number, track: { left: number; width: number }, days: number) {
  if (track.width <= 0 || days <= 0) return 0;
  const index = Math.floor(((clientX - track.left) / track.width) * days);

  return Math.min(days - 1, Math.max(0, index));
}

function shiftValue(value: string, days: number, dateOnly: boolean | undefined, timeZone: string) {
  const zone = dateOnly ? 'UTC' : timeZone;
  const from = dayKey(value, zone);

  return moveCalendarEvent(
    { id: '', start: value },
    { end: '', key: shiftKey(from, days), kind: 'day', start: '' },
    { dateOnly, from, timeZone: zone },
  ).start;
}

/** Moves a bar by whole days: every date it has moves, and a missing one stays missing. */
export function moveTimelineItem<T extends TimelineItem>(
  item: T,
  days: number,
  timeZone: string,
  dateOnly: TimelineDateOnly = {},
): TimelineChange<T> {
  return {
    end: item.end ? shiftValue(item.end, days, dateOnly.end, timeZone) : undefined,
    item,
    start: item.start ? shiftValue(item.start, days, dateOnly.start, timeZone) : undefined,
  };
}

function localNoon(key: string, timeZone: string): string {
  const [year, month, day] = key.split('-').map(Number);

  return new Date(new TZDate(year, month - 1, day, 12, timeZone).getTime()).toISOString();
}

function moveToDay(value: string, key: string, timeZone: string): string {
  return moveCalendarEvent(
    { id: '', start: value },
    { end: '', key, kind: 'day', start: '' },
    { from: dayKey(value, timeZone), timeZone },
  ).start;
}

/**
 * Drags one edge by whole days, stopping where the bar is one day long. A missing date is filled in
 * on the dropped day, so dragging a one-date record's free edge gives it a span: at the other
 * date's time of day when both are timed, and at noon otherwise or when that time would land the
 * bar's edge on another day.
 */
export function resizeTimelineItem<T extends TimelineItem>(
  item: T,
  edge: TimelineEdge,
  days: number,
  timeZone: string,
  dateOnly: TimelineDateOnly = {},
): TimelineChange<T> {
  const span = getItemDays(item, timeZone, dateOnly);
  const unchanged = { end: item.end, item, start: item.start };
  if (!span) return unchanged;
  const width = daysBetween(span.first, span.last);
  const steps = edge === 'start' ? Math.min(days, width) : Math.max(days, -width);
  const current = item[edge];

  if (!current) {
    if (steps === 0) return unchanged;
    const other = edge === 'start' ? 'end' : 'start';
    const key = shiftKey(edge === 'start' ? span.first : span.last, steps);
    if (dateOnly[edge]) return { ...unchanged, [edge]: `${key}T12:00:00.000Z` };
    const noon = { ...unchanged, [edge]: localNoon(key, timeZone) };
    const source = item[other];
    if (!source || dateOnly[other]) return noon;
    const kept = moveToDay(source, key, timeZone);
    const days = getItemDays({ ...item, [edge]: kept }, timeZone, dateOnly);

    return days?.[edge === 'start' ? 'first' : 'last'] === key
      ? { ...unchanged, [edge]: kept }
      : noon;
  }

  const value = shiftValue(current, steps, dateOnly[edge], timeZone);
  const start = edge === 'start' ? value : item.start;
  const end = edge === 'end' ? value : item.end;
  const sameKind = Boolean(dateOnly.start) === Boolean(dateOnly.end);

  if (sameKind && start && end && Date.parse(end) < Date.parse(start)) {
    return edge === 'start' ? { end, item, start: end } : { end: start, item, start };
  }

  return { end, item, start };
}
