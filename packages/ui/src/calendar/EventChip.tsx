'use client';

import { useDraggable } from '@dnd-kit/core';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';

import type { CalendarEvent, CalendarLane } from './core/index.js';
import type { CalendarResizeEdge } from './useCalendar.js';

export function EventChip<T extends CalendarEvent>({
  disabled,
  dragId,
  event,
  hidden,
  lane,
  onClick,
  onResizeStart,
  renderEvent,
  style,
}: {
  disabled?: boolean;
  dragId?: string;
  event: T;
  hidden?: boolean;
  lane?: CalendarLane<T>;
  onClick?: () => void;
  onResizeStart?: (edge: CalendarResizeEdge, event: PointerEvent) => void;
  renderEvent: (event: T) => ReactNode;
  style?: CSSProperties;
}) {
  const drag = useDraggable({ data: { eventId: event.id }, disabled, id: dragId ?? event.id });
  const resize = (edge: CalendarResizeEdge) => (pointer: PointerEvent) => {
    pointer.stopPropagation();
    onResizeStart?.(edge, pointer);
  };
  return (
    <div
      {...drag.attributes}
      {...drag.listeners}
      className={`frog-calendar__event${hidden || drag.isDragging ? ' frog-calendar__event--dragging' : ''}`}
      onClick={onClick}
      ref={drag.setNodeRef}
      style={
        {
          '--frog-calendar-event-color': event.color,
          ...style,
          ...(lane
            ? {
                left: `${(lane.lane / lane.laneCount) * 100}%`,
                width: `${100 / lane.laneCount}%`,
              }
            : {}),
        } as CSSProperties
      }
    >
      {renderEvent(event)}
      {!disabled && onResizeStart ? (
        <>
          <button
            aria-label="Resize start"
            className="frog-calendar__resize frog-calendar__resize--start"
            onPointerDown={resize('start')}
            type="button"
          />
          <button
            aria-label="Resize end"
            className="frog-calendar__resize frog-calendar__resize--end"
            onPointerDown={resize('end')}
            type="button"
          />
        </>
      ) : null}
    </div>
  );
}
