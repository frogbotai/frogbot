'use client';

import { useDroppable } from '@dnd-kit/core';
import { addDays, format } from 'date-fns';
import type { ReactNode } from 'react';

import type { CalendarEvent } from './core/index.js';
import { EventChip } from './EventChip.js';

function AllDayCell<T extends CalendarEvent>({
  activeId,
  day,
  events,
  renderEvent,
}: {
  activeId: string | null;
  day: Date;
  events: T[];
  renderEvent: (event: T) => ReactNode;
}) {
  const key = format(day, 'yyyy-MM-dd');
  const drop = useDroppable({
    data: {
      slotAt: () => ({ end: addDays(day, 1).toISOString(), key, start: day.toISOString() }),
    },
    id: `all-day-${key}`,
  });
  return (
    <div className="frog-calendar__all-day-cell" ref={drop.setNodeRef}>
      {events
        .filter(
          (event) =>
            event.start.slice(0, 10) <= key && (event.end ?? event.start).slice(0, 10) >= key,
        )
        .map((event) => (
          <EventChip
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
  days,
  events,
  renderEvent,
}: {
  activeId: string | null;
  days: Date[];
  events: T[];
  renderEvent: (event: T) => ReactNode;
}) {
  return (
    <div className="frog-calendar__all-day">
      <span className="frog-calendar__all-day-label">All day</span>
      {days.map((day) => (
        <AllDayCell
          activeId={activeId}
          day={day}
          events={events}
          key={day.toISOString()}
          renderEvent={renderEvent}
        />
      ))}
    </div>
  );
}
