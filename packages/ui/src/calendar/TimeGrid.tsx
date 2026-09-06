'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { format } from 'date-fns';
import type { CSSProperties, ReactNode } from 'react';

import { AllDayRow } from './AllDayRow.js';
import { type CalendarEvent, getRangeDays, layoutLanes } from './core/index.js';
import { DayColumn } from './DayColumn.js';
import { EventChip } from './EventChip.js';
import { useCalendar, type UseCalendarProps } from './useCalendar.js';

export type TimeGridProps<T extends CalendarEvent> = UseCalendarProps<T> & {
  hourHeight?: number;
  isAllDay?: (event: T) => boolean;
  renderEvent: (event: T) => ReactNode;
};

export function TimeGrid<T extends CalendarEvent>(props: TimeGridProps<T>) {
  const calendar = useCalendar(props);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const dayCount = props.mode === 'day' ? 1 : 7;
  const days = getRangeDays(calendar.range, dayCount);
  const isAllDay =
    props.isAllDay ??
    ((event) => Date.parse(event.end ?? event.start) - Date.parse(event.start) >= 86_400_000);
  const allDay = calendar.events.filter(isAllDay);
  const timed = calendar.events.filter((event) => !isAllDay(event));
  const active = calendar.events.find((event) => event.id === calendar.activeId);
  const hourHeight = props.hourHeight ?? 56;
  return (
    <DndContext
      collisionDetection={(args) =>
        pointerWithin(args).length ? pointerWithin(args) : rectIntersection(args)
      }
      sensors={sensors}
      {...calendar.handlers}
    >
      <div
        className="frog-calendar__time-grid"
        style={{ '--frog-calendar-days': dayCount } as CSSProperties}
      >
        <div className="frog-calendar__days-header">
          <span />
          {days.map((day) => (
            <strong key={day.toISOString()}>{format(day, 'EEE d')}</strong>
          ))}
        </div>
        <AllDayRow
          activeId={calendar.activeId}
          days={days}
          events={allDay}
          renderEvent={props.renderEvent}
        />
        <div className="frog-calendar__time-scroll">
          <div className="frog-calendar__times" style={{ height: hourHeight * 24 }}>
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour} style={{ top: hour * hourHeight }}>
                {format(new Date(2000, 0, 1, hour), 'ha')}
              </span>
            ))}
          </div>
          <div
            className="frog-calendar__day-columns"
            style={{ gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))` }}
          >
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const events = timed.filter((event) => event.start.slice(0, 10) === key);
              return (
                <DayColumn
                  activeId={calendar.activeId}
                  canEdit={props.canEdit ?? (() => true)}
                  create={calendar.handlers.create}
                  date={day}
                  events={events}
                  hourHeight={hourHeight}
                  key={key}
                  lanes={layoutLanes(events)}
                  placement={calendar.placement}
                  renderEvent={props.renderEvent}
                  resize={calendar.handlers.resize}
                  snap={props.snap ?? 30}
                />
              );
            })}
          </div>
        </div>
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
