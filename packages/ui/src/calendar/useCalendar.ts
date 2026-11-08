'use client';

import { TZDate } from '@date-fns/tz';
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import { addDays, addMonths } from 'date-fns';
import { useEffect, useRef, useState } from 'react';

import {
  type CalendarEvent,
  type CalendarMode,
  dayKey,
  expandToCells,
  getFloatingRange,
  getVisibleRange,
  layoutLanes,
  parseCalendarDate,
  snapTo,
} from './core/index.js';

/** Where a drop lands: a `day` cell keeps the event's time of day, a `time` slot sets its start. */
export type CalendarPlacement = { end: string; key: string; kind: 'day' | 'time'; start: string };

/** How a move is read: the grid's zone, the day cell the drag began in, and date-only values. */
export type CalendarMoveOptions = { dateOnly?: boolean; from?: string; timeZone?: string };

export type CalendarDropData = {
  slotAt?: (clientX: number, clientY: number) => CalendarPlacement | null;
};

export type CalendarChange<T> = { end: string; event: T; start: string };

export type CalendarCreate = { end: string; start: string };

export type CalendarResizeEdge = 'end' | 'start';

export type UseCalendarProps<T extends CalendarEvent> = {
  canEdit?: (event: T) => boolean;
  /** Whether events can be resized. Turn it off when there is no end to save. */
  canResize?: boolean;
  date: string;
  /** Events are dates without a time, stored at 12:00 UTC: they show all day on their UTC date. */
  dateOnly?: boolean;
  events: T[];
  getId?: (event: T) => string;
  mode: CalendarMode;
  onCreate?: (range: CalendarCreate) => Promise<void> | void;
  onMove?: (change: CalendarChange<T>) => Promise<void> | void;
  onNavigate?: (date: string) => void;
  onResize?: (change: CalendarChange<T>) => Promise<void> | void;
  onSetMode?: (mode: CalendarMode) => void;
  snap?: number;
  timeZone?: string;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

export function getCalendarPointerPosition({
  activatorEvent,
  delta,
}: Pick<DragMoveEvent | DragEndEvent, 'activatorEvent' | 'delta'>) {
  const event = activatorEvent as {
    clientX?: number;
    clientY?: number;
    touches?: { clientX: number; clientY: number }[];
  } | null;

  const x = event?.clientX ?? event?.touches?.[0]?.clientX;
  const y = event?.clientY ?? event?.touches?.[0]?.clientY;

  return x === undefined || y === undefined ? null : { x: x + delta.x, y: y + delta.y };
}

export function resolveCalendarDrop(
  data: CalendarDropData | undefined,
  point: { x: number; y: number } | null,
): CalendarPlacement | null {
  return point && data?.slotAt ? data.slotAt(point.x, point.y) : null;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function moveCalendarEvent<T extends CalendarEvent>(
  event: T,
  placement: CalendarPlacement,
  { dateOnly = false, from, timeZone = 'UTC' }: CalendarMoveOptions = {},
): CalendarChange<T> {
  if (placement.kind === 'time' && !dateOnly) {
    const duration = Date.parse(event.end ?? event.start) - Date.parse(event.start);
    const start = new Date(placement.start).toISOString();

    return { end: new Date(Date.parse(start) + duration).toISOString(), event, start };
  }

  const days = daysBetween(from ?? dayKey(event.start, timeZone), placement.key);
  const shift = (value: string) =>
    new Date(addDays(new TZDate(Date.parse(value), timeZone), days).getTime()).toISOString();

  const start = shift(event.start);
  const end = event.end ? shift(event.end) : start;
  const noon = (value: string) => `${dayKey(value, timeZone)}T12:00:00.000Z`;

  return dateOnly ? { end: noon(end), event, start: noon(start) } : { end, event, start };
}

export function resizeCalendarEvent<T extends CalendarEvent>({
  edge,
  event,
  instant,
  snap,
  timeZone = 'UTC',
}: {
  edge: CalendarResizeEdge;
  event: T;
  instant: string;
  snap: number;
  timeZone?: string;
}): CalendarChange<T> {
  const interval = snap * 60_000;
  const originalStart = new Date(event.start).toISOString();
  const originalEnd = new Date(event.end ?? event.start).toISOString();
  const snapped = snapTo(instant, snap, timeZone);
  const start =
    edge === 'start'
      ? new Date(Math.min(Date.parse(snapped), Date.parse(originalEnd) - interval)).toISOString()
      : originalStart;

  const end =
    edge === 'end'
      ? new Date(Math.max(Date.parse(snapped), Date.parse(originalStart) + interval)).toISOString()
      : originalEnd;

  return { end, event, start };
}

export function createCalendarRange(
  start: string,
  end: string,
  snap: number,
  timeZone = 'UTC',
): CalendarCreate {
  const first = snapTo(start, snap, timeZone);
  const second = snapTo(end, snap, timeZone);
  const interval = snap * 60_000;
  const firstTime = Date.parse(first);
  const secondTime = Date.parse(second);

  return {
    end: new Date(
      Math.max(firstTime, secondTime, Math.min(firstTime, secondTime) + interval),
    ).toISOString(),
    start: new Date(Math.min(firstTime, secondTime)).toISOString(),
  };
}

export function isCalendarNoopDrop<T extends CalendarEvent>(
  event: T,
  placement: CalendarPlacement,
  { from, timeZone = 'UTC' }: CalendarMoveOptions = {},
): boolean {
  return placement.kind === 'day'
    ? placement.key === (from ?? dayKey(event.start, timeZone))
    : Date.parse(event.start) === Date.parse(placement.start);
}

export function useCalendar<T extends CalendarEvent>({
  canEdit = () => true,
  canResize = true,
  date,
  dateOnly = false,
  events,
  getId = (event) => event.id,
  mode,
  onCreate,
  onMove,
  onNavigate,
  onResize,
  onSetMode,
  snap = 30,
  timeZone = 'UTC',
  weekStartsOn = 0,
}: UseCalendarProps<T>) {
  const [currentEvents, setCurrentEvents] = useState(events);
  const [overrides, setOverrides] = useState<Record<string, { end: string; start: string }>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeHeight, setActiveHeight] = useState(0);
  const [placement, setPlacement] = useState<CalendarPlacement | null>(null);
  const placementRef = useRef<CalendarPlacement | null>(null);

  useEffect(() => {
    setCurrentEvents(events);
    setOverrides({});
  }, [events]);

  const displayedEvents = currentEvents.map((event) => {
    const override = overrides[getId(event)];

    return override ? { ...event, ...override } : event;
  });

  const zonedRange = getVisibleRange({ date, mode, timeZone, weekStartsOn });
  const range = dateOnly ? getFloatingRange(zonedRange) : zonedRange;
  const resizable = canResize && !dateOnly;
  const moveOptions = (from: unknown): CalendarMoveOptions => ({
    dateOnly,
    from: typeof from === 'string' ? from : undefined,
    timeZone: range.timeZone,
  });

  const cells = expandToCells(displayedEvents, range);
  const lanes = layoutLanes(displayedEvents);

  const place = (next: CalendarPlacement | null) => {
    placementRef.current = next;
    setPlacement(next);
  };

  const reset = () => {
    setActiveId(null);
    setActiveHeight(0);
    place(null);
  };

  const commit = async (
    change: CalendarChange<T>,
    handler: ((change: CalendarChange<T>) => Promise<void> | void) | undefined,
  ) => {
    const id = getId(change.event);
    setOverrides((value) => ({ ...value, [id]: { end: change.end, start: change.start } }));
    try {
      await handler?.(change);
    } catch (error) {
      setOverrides((value) => {
        const next = { ...value };
        delete next[id];

        return next;
      });

      throw error;
    }
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.data.current?.eventId ?? active.id);
    const event = currentEvents.find((candidate) => getId(candidate) === id);
    if (!event || !canEdit(event)) return;
    const rect = active.rect.current.initial ?? active.rect.current.translated;
    setActiveId(id);
    setActiveHeight(rect?.height ?? 0);
  };

  const onDragMove = (drag: DragMoveEvent) => {
    const id = String(drag.active.data.current?.eventId ?? drag.active.id);
    const event = currentEvents.find((candidate) => getId(candidate) === id);
    const next = resolveCalendarDrop(drag.over?.data.current, getCalendarPointerPosition(drag));
    if (!event || !canEdit(event)) return place(null);
    const options = moveOptions(drag.active.data.current?.cell);

    place(
      next && !isCalendarNoopDrop(event, next, options)
        ? { ...moveCalendarEvent(event, next, options), key: next.key, kind: next.kind }
        : null,
    );
  };

  const onDragCancel = reset;
  const onDragEnd = async (drag: DragEndEvent) => {
    const { active, over } = drag;
    const id = String(active.data.current?.eventId ?? active.id);
    const event = currentEvents.find((candidate) => getId(candidate) === id);
    const resolved = resolveCalendarDrop(over?.data.current, getCalendarPointerPosition(drag));
    const dropped = placementRef.current ?? resolved;
    const options = moveOptions(active.data.current?.cell);
    reset();
    if (
      over &&
      dropped &&
      event &&
      canEdit(event) &&
      !isCalendarNoopDrop(event, dropped, options)
    ) {
      await commit(moveCalendarEvent(event, dropped, options), onMove);
    }
  };

  const resize = async (event: T, edge: CalendarResizeEdge, instant: string) => {
    if (!resizable || !canEdit(event)) return;

    await commit(
      resizeCalendarEvent({ edge, event, instant, snap, timeZone: range.timeZone }),
      onResize,
    );
  };

  const create = async (start: string, end: string) => {
    await onCreate?.(createCalendarRange(start, end, snap, range.timeZone));
  };

  const navigate = (direction: 'next' | 'previous' | 'today') => {
    if (direction === 'today') return onNavigate?.(new Date().toISOString());
    const amount = direction === 'next' ? 1 : -1;
    const zoned = parseCalendarDate(date, timeZone);
    const next =
      mode === 'month'
        ? addMonths(zoned, amount)
        : addDays(zoned, amount * (mode === 'week' ? 7 : 1));

    onNavigate?.(new Date(next.getTime()).toISOString());
  };

  return {
    activeHeight,
    activeId,
    cells,
    events: displayedEvents,
    handlers: { create, onDragCancel, onDragEnd, onDragMove, onDragStart, resize },
    lanes,
    navigate,
    placement,
    range,
    resizable,
    setMode: onSetMode,
  };
}
