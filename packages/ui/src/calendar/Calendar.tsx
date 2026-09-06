'use client';

import { CalendarHeader } from './CalendarHeader.js';
import type { CalendarEvent, CalendarMode } from './core/index.js';
import { MonthGrid } from './MonthGrid.js';
import { TimeGrid, type TimeGridProps } from './TimeGrid.js';
import { useCalendar } from './useCalendar.js';

export type CalendarProps<T extends CalendarEvent> = TimeGridProps<T> & {
  modes?: CalendarMode[];
};

export function Calendar<T extends CalendarEvent>(props: CalendarProps<T>) {
  const navigation = useCalendar(props);
  return (
    <section className="frog-calendar">
      <CalendarHeader
        date={props.date}
        mode={props.mode}
        modes={props.modes}
        navigate={navigation.navigate}
        setMode={navigation.setMode}
      />
      {props.mode === 'month' ? <MonthGrid {...props} /> : <TimeGrid {...props} />}
    </section>
  );
}
