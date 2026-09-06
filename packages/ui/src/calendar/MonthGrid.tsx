'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { addDays, format, isSameMonth } from 'date-fns';
import type { ReactNode } from 'react';

import { type CalendarCellEvent, type CalendarEvent, getRangeDays } from './core/index.js';
import { EventChip } from './EventChip.js';
import { type CalendarPlacement, useCalendar, type UseCalendarProps } from './useCalendar.js';

function MonthCell<T extends CalendarEvent>({
  activeId,
  cells,
  date,
  placement,
  renderEvent,
}: {
  activeId: string | null;
  cells: CalendarCellEvent<T>[];
  date: Date;
  placement: CalendarPlacement | null;
  renderEvent: (event: T) => ReactNode;
}) {
  const key = format(date, 'yyyy-MM-dd');
  const drop = useDroppable({
    data: {
      slotAt: () => ({ end: addDays(date, 1).toISOString(), key, start: date.toISOString() }),
    },
    id: `month-${key}`,
  });
  const visible = cells.slice(0, 3);
  return (
    <div
      className={`frog-calendar__month-cell${placement?.key === key ? ' frog-calendar__month-cell--placing' : ''}`}
      ref={drop.setNodeRef}
    >
      <span className="frog-calendar__month-date">{format(date, 'd')}</span>
      {visible.map(({ event }) => (
        <EventChip
          dragId={`${event.id}:${key}`}
          event={event}
          hidden={activeId === event.id}
          key={event.id}
          renderEvent={renderEvent}
        />
      ))}
      {cells.length > visible.length ? (
        <span className="frog-calendar__more">+{cells.length - visible.length} more</span>
      ) : null}
      {placement?.key === key ? <div className="frog-calendar__month-preview" /> : null}
    </div>
  );
}

export type MonthGridProps<T extends CalendarEvent> = UseCalendarProps<T> & {
  renderEvent: (event: T) => ReactNode;
};

export function MonthGrid<T extends CalendarEvent>(props: MonthGridProps<T>) {
  const calendar = useCalendar(props);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const days = getRangeDays(calendar.range, 42);
  const active = calendar.events.find((event) => event.id === calendar.activeId);
  return (
    <DndContext
      collisionDetection={(args) =>
        pointerWithin(args).length ? pointerWithin(args) : rectIntersection(args)
      }
      sensors={sensors}
      {...calendar.handlers}
    >
      <div className="frog-calendar__month-weekdays">
        {days.slice(0, 7).map((day) => (
          <strong key={day.toISOString()}>{format(day, 'EEE')}</strong>
        ))}
      </div>
      <div className="frog-calendar__month-grid">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          return (
            <div
              className={isSameMonth(day, props.date) ? '' : 'frog-calendar__month-outside'}
              key={key}
            >
              <MonthCell
                activeId={calendar.activeId}
                cells={calendar.cells.filter((cell) => cell.cell === key)}
                date={day}
                placement={calendar.placement}
                renderEvent={props.renderEvent}
              />
            </div>
          );
        })}
      </div>
      <DragOverlay>
        {active ? (
          <div className="frog-calendar__overlay">
            <EventChip
              disabled
              dragId={`overlay:${active.id}`}
              event={active}
              renderEvent={props.renderEvent}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
