'use client';

import { useDraggable } from '@dnd-kit/core';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';

import type { CalendarEvent, CalendarLane } from './core/index.js';
import type { CalendarResizeEdge } from './useCalendar.js';

const EDGES: CalendarResizeEdge[] = ['start', 'end'];

export function EventChip<T extends CalendarEvent>({
  cell,
  disabled,
  dragId,
  event,
  hidden,
  lane,
  onClick,
  onResizeStart,
  renderEvent,
  resizeEdges = EDGES,
  style,
}: {
  /** The day cell this chip is drawn in, so a drag between days shifts by the right amount. */
  cell?: string;
  disabled?: boolean;
  dragId?: string;
  event: T;
  hidden?: boolean;
  lane?: CalendarLane<T>;
  onClick?: () => void;
  onResizeStart?: (edge: CalendarResizeEdge, event: PointerEvent) => void;
  renderEvent: (event: T) => ReactNode;
  resizeEdges?: CalendarResizeEdge[];
  style?: CSSProperties;
}) {
  const drag = useDraggable({
    data: { cell, eventId: event.id },
    disabled,
    id: dragId ?? event.id,
  });

  const resize = (edge: CalendarResizeEdge) => (pointer: PointerEvent) => {
    pointer.stopPropagation();
    onResizeStart?.(edge, pointer);
  };

  const onKeyDown = (keyboard: KeyboardEvent) => {
    if (
      keyboard.target !== keyboard.currentTarget ||
      (keyboard.key !== 'Enter' && keyboard.key !== ' ')
    ) {
      return;
    }

    keyboard.preventDefault();
    onClick?.();
  };

  return (
    <div
      {...drag.attributes}
      {...drag.listeners}
      className={`frog-calendar__event${hidden || drag.isDragging ? ' frog-calendar__event--dragging' : ''}`}
      onClick={onClick}
      onKeyDown={onClick ? onKeyDown : undefined}
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
      {!disabled && onResizeStart
        ? resizeEdges.map((edge) => (
            <button
              aria-label={`Resize ${edge}`}
              className={`frog-calendar__resize frog-calendar__resize--${edge}`}
              key={edge}
              onPointerDown={resize(edge)}
              type="button"
            />
          ))
        : null}
    </div>
  );
}
