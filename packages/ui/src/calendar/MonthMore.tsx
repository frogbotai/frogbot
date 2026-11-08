'use client';

import { format } from 'date-fns';
import type { ReactNode } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '../components/popover.js';
import type { CalendarCellEvent, CalendarEvent } from './core/index.js';
import { EventChip } from './EventChip.js';

export function MonthMore<T extends CalendarEvent>({
  cells,
  date,
  hidden,
  renderEvent,
}: {
  cells: CalendarCellEvent<T>[];
  date: Date;
  hidden: number;
  renderEvent: (event: T) => ReactNode;
}) {
  const key = format(date, 'yyyy-MM-dd');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="frog-calendar__more" type="button">
          +{hidden} more
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={format(date, 'EEEE, MMMM d')}
        className="frog-calendar__more-list"
      >
        <strong className="frog-calendar__more-date">{format(date, 'EEE d')}</strong>
        {cells.map(({ event }) => (
          <EventChip
            disabled
            dragId={`more:${event.id}:${key}`}
            event={event}
            key={event.id}
            renderEvent={renderEvent}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
