'use client';

import { TZDate } from '@date-fns/tz';
import { useDroppable } from '@dnd-kit/core';
import { addDays, addMinutes, differenceInCalendarDays, format, set, startOfDay } from 'date-fns';
import type { PointerEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';

import { type CalendarCellEvent, type CalendarEvent, layoutLanes } from './core/index.js';
import { CurrentTimeIndicator } from './CurrentTimeIndicator.js';
import { EventChip } from './EventChip.js';
import { TimeSlot } from './TimeSlot.js';
import {
  type CalendarChange,
  type CalendarPlacement,
  type CalendarResizeEdge,
  resizeCalendarEvent,
} from './useCalendar.js';

const MINUTES_PER_DAY = 1_440;

export function DayColumn<T extends CalendarEvent>({
  activeId,
  canEdit,
  create,
  date,
  hourHeight,
  nowTimeZone,
  placement,
  renderEvent,
  resizable,
  resize,
  segments,
  snap,
  timeZone,
}: {
  activeId: string | null;
  canEdit: (event: T) => boolean;
  create: (start: string, end: string) => void;
  date: Date;
  hourHeight: number;
  nowTimeZone: string;
  placement: CalendarPlacement | null;
  renderEvent: (event: T) => ReactNode;
  resizable: boolean;
  resize: (event: T, edge: CalendarResizeEdge, instant: string) => void;
  segments: CalendarCellEvent<T>[];
  snap: number;
  timeZone: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<CalendarChange<T> | null>(null);
  const dayStart = startOfDay(new TZDate(date.getTime(), timeZone));
  const dayEnd = addDays(dayStart, 1);
  const key = format(dayStart, 'yyyy-MM-dd');
  const minuteOf = (instant: number) => {
    const zoned = new TZDate(instant, timeZone);
    if (differenceInCalendarDays(zoned, dayStart) > 0) return MINUTES_PER_DAY;

    return Math.max(0, zoned.getHours() * 60 + zoned.getMinutes());
  };

  const box = (start: number, end: number) => {
    const top = minuteOf(Math.max(start, dayStart.getTime()));
    const bottom = minuteOf(Math.min(end, dayEnd.getTime()));

    return {
      height: Math.max(18, ((bottom - top) / 60) * hourHeight),
      top: (top / 60) * hourHeight,
    };
  };

  const instantAt = (clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    const ratio = rect?.height ? (clientY - rect.top) / rect.height : 0;
    const minutes = Math.max(0, Math.min(MINUTES_PER_DAY, ratio * MINUTES_PER_DAY));
    const snapped = Math.round(minutes / snap) * snap;
    const instant =
      snapped >= MINUTES_PER_DAY
        ? dayEnd
        : set(dayStart, { hours: Math.floor(snapped / 60), minutes: snapped % 60 });

    return new Date(instant.getTime()).toISOString();
  };

  const drop = useDroppable({
    data: {
      slotAt: (_clientX: number, clientY: number): CalendarPlacement => {
        const start = instantAt(clientY);

        return { end: addMinutes(start, snap).toISOString(), key, kind: 'time', start };
      },
    },
    id: `time-${key}`,
  });

  const setRef = (node: HTMLDivElement | null) => {
    ref.current = node;
    drop.setNodeRef(node);
  };

  const beginCreate = (pointer: PointerEvent) => {
    if (pointer.button !== 0 || (pointer.target as HTMLElement).closest('.frog-calendar__event')) {
      return;
    }

    const target = pointer.currentTarget;
    const pointerId = pointer.pointerId;
    target.setPointerCapture(pointerId);
    const start = instantAt(pointer.clientY);
    const finish = (event: globalThis.PointerEvent) => {
      target.releasePointerCapture(pointerId);
      create(start, instantAt(event.clientY));
      window.removeEventListener('pointerup', finish);
    };

    window.addEventListener('pointerup', finish);
  };

  const beginResize = (event: T, edge: CalendarResizeEdge) => {
    const at = (clientY: number) =>
      resizeCalendarEvent({ edge, event, instant: instantAt(clientY), snap });

    const stop = () => {
      setPreview(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('keydown', cancel);
    };

    const move = (moved: globalThis.PointerEvent) => setPreview(at(moved.clientY));
    const finish = (released: globalThis.PointerEvent) => {
      stop();
      resize(event, edge, instantAt(released.clientY));
    };

    const cancel = (keyboard: KeyboardEvent) => {
      if (keyboard.key === 'Escape') stop();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('keydown', cancel);
  };

  const shown = segments.map((segment) =>
    preview?.event.id === segment.event.id
      ? {
          ...segment,
          end: new Date(Math.min(Date.parse(preview.end), dayEnd.getTime())).toISOString(),
          start: new Date(Math.max(Date.parse(preview.start), dayStart.getTime())).toISOString(),
        }
      : segment,
  );

  const lanes = layoutLanes(shown.map(({ end, event, start }) => ({ end, id: event.id, start })));

  return (
    <div
      className="frog-calendar__day-column"
      onPointerDown={beginCreate}
      ref={setRef}
      style={{ height: hourHeight * 24 }}
    >
      {Array.from({ length: 24 }, (_, hour) => (
        <TimeSlot key={hour} style={{ height: hourHeight }} />
      ))}
      <CurrentTimeIndicator day={key} hourHeight={hourHeight} timeZone={nowTimeZone} />
      {shown.map(({ end, endsAfterCell, event, start, startsBeforeCell }) => {
        const lane = lanes.find(({ event: candidate }) => candidate.id === event.id);
        const edges: CalendarResizeEdge[] = [
          ...(startsBeforeCell ? [] : (['start'] as const)),
          ...(endsAfterCell ? [] : (['end'] as const)),
        ];

        return (
          <EventChip
            cell={key}
            disabled={!canEdit(event)}
            dragId={`${event.id}:${key}`}
            event={event}
            hidden={activeId === event.id}
            key={event.id}
            lane={lane && { event, lane: lane.lane, laneCount: lane.laneCount }}
            onResizeStart={resizable ? (edge) => beginResize(event, edge) : undefined}
            renderEvent={renderEvent}
            resizeEdges={edges}
            style={box(Date.parse(start), Date.parse(end))}
          />
        );
      })}
      {placement?.key === key && placement.kind === 'time' ? (
        <div
          className="frog-calendar__preview"
          style={box(Date.parse(placement.start), Date.parse(placement.end))}
        />
      ) : null}
    </div>
  );
}
