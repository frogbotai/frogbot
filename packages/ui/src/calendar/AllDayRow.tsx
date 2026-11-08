'use client';

import { useDroppable } from '@dnd-kit/core';
import { addDays, format } from 'date-fns';
import type { ReactNode } from 'react';

import type { CalendarCellEvent, CalendarEvent } from './core/index.js';
import { EventChip } from './EventChip.js';
import type { CalendarPlacement } from './useCalendar.js';

function AllDayCell<T extends CalendarEvent>({
  activeId,
  cells,
  day,
  renderEvent,
}: {
  activeId: string | null;
  cells: CalendarCellEvent<T>[];
  day: Date;
  renderEvent: (event: T) => ReactNode;
}) {
  const key = format(day, 'yyyy-MM-dd');
  const drop = useDroppable({
    data: {
      slotAt: (): CalendarPlacement => ({
        end: addDays(day, 1).toISOString(),
        key,
        kind: 'day',
        start: day.toISOString(),
      }),
    },
    id: `all-day-${key}`,
  });

  return (
    <div className="frog-calendar__all-day-cell" ref={drop.setNodeRef}>
      {cells.map(({ event }) => (
        <EventChip
          cell={key}
          dragId={`${event.id}:${key}`}
          event={event}
          hidden={activeId === event.id}
          key={event.id}
          renderEvent={renderEvent}
        />
      ))}
    </div>
  );
}

export function AllDayRow<T extends CalendarEvent>({
  activeId,
  cells,
  days,
  renderEvent,
}: {
  activeId: string | null;
  cells: CalendarCellEvent<T>[];
  days: Date[];
  renderEvent: (event: T) => ReactNode;
}) {
  return (
    <div className="frog-calendar__all-day">
      <span className="frog-calendar__all-day-label">All day</span>
      {days.map((day) => {
        const key = format(day, 'yyyy-MM-dd');

        return (
          <AllDayCell
            activeId={activeId}
            cells={cells.filter((cell) => cell.cell === key)}
            day={day}
            key={key}
            renderEvent={renderEvent}
          />
        );
      })}
    </div>
  );
}
