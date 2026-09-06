'use client';

import { useDroppable } from '@dnd-kit/core';
import { addMinutes, format, startOfDay } from 'date-fns';
import type { PointerEvent, ReactNode } from 'react';
import { useRef } from 'react';

import type { CalendarEvent, CalendarLane } from './core/index.js';
import { CurrentTimeIndicator } from './CurrentTimeIndicator.js';
import { EventChip } from './EventChip.js';
import { TimeSlot } from './TimeSlot.js';
import type { CalendarPlacement, CalendarResizeEdge } from './useCalendar.js';

const MINUTES_PER_DAY = 1_440;

export function DayColumn<T extends CalendarEvent>({
  activeId,
  canEdit,
  create,
  date,
  events,
  hourHeight,
  lanes,
  placement,
  renderEvent,
  resize,
  snap,
}: {
  activeId: string | null;
  canEdit: (event: T) => boolean;
  create: (start: string, end: string) => void;
  date: Date;
  events: T[];
  hourHeight: number;
  lanes: CalendarLane<T>[];
  placement: CalendarPlacement | null;
  renderEvent: (event: T) => ReactNode;
  resize: (event: T, edge: CalendarResizeEdge, instant: string) => void;
  snap: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dayStart = startOfDay(date);
  const key = format(dayStart, 'yyyy-MM-dd');
  const instantAt = (clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return dayStart.toISOString();
    const minutes = Math.max(
      0,
      Math.min(MINUTES_PER_DAY, ((clientY - rect.top) / rect.height) * MINUTES_PER_DAY),
    );
    return addMinutes(dayStart, Math.round(minutes / snap) * snap).toISOString();
  };
  const drop = useDroppable({
    data: {
      slotAt: (_clientX: number, clientY: number) => {
        const start = instantAt(clientY);
        return { end: addMinutes(start, snap).toISOString(), key, start };
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
    const finish = (released: globalThis.PointerEvent) => {
      resize(event, edge, instantAt(released.clientY));
      window.removeEventListener('pointerup', finish);
    };
    window.addEventListener('pointerup', finish);
  };
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
      <CurrentTimeIndicator day={key} hourHeight={hourHeight} />
      {events.map((event) => {
        const start = Math.max(Date.parse(event.start), dayStart.getTime());
        const end = Math.min(
          Date.parse(event.end ?? event.start),
          addMinutes(dayStart, MINUTES_PER_DAY).getTime(),
        );
        const lane = lanes.find(({ event: candidate }) => candidate.id === event.id);
        return (
          <EventChip
            disabled={!canEdit(event)}
            event={event}
            hidden={activeId === event.id}
            key={event.id}
            lane={lane}
            onResizeStart={(edge) => beginResize(event, edge)}
            renderEvent={renderEvent}
            style={{
              height: Math.max(18, ((end - start) / 3_600_000) * hourHeight),
              top: ((start - dayStart.getTime()) / 3_600_000) * hourHeight,
            }}
          />
        );
      })}
      {placement?.key === key ? (
        <div
          className="frog-calendar__preview"
          style={{
            height: Math.max(
              18,
              ((Date.parse(placement.end) - Date.parse(placement.start)) / 3_600_000) * hourHeight,
            ),
            top: ((Date.parse(placement.start) - dayStart.getTime()) / 3_600_000) * hourHeight,
          }}
        />
      ) : null}
    </div>
  );
}
