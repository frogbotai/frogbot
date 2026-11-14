'use client';

import { useEffect, useRef, useState } from 'react';

import {
  moveTimelineItem,
  resizeTimelineItem,
  type TimelineChange,
  type TimelineDateOnly,
  type TimelineEdge,
  type TimelineItem,
} from './core.js';

/** What a pointer is doing to a bar: moving it, or dragging one of its edges, by `days`. */
export type TimelineDrag = { days: number; id: string; kind: 'move' | TimelineEdge };

export type UseTimelineProps<T extends TimelineItem> = {
  canEdit?: (item: T) => boolean;
  dateOnly?: TimelineDateOnly;
  items: T[];
  onMove?: (change: TimelineChange<T>) => Promise<void> | void;
  onResize?: (change: TimelineChange<T>) => Promise<void> | void;
  timeZone: string;
};

const DRAG_THRESHOLD = 4;

/**
 * Drag state for a timeline. A press on a bar becomes a drag after a few pixels; each whole day
 * of travel shifts the preview, and release saves through `onMove` or `onResize`. The bar keeps
 * its new dates while the save runs and goes back if it fails.
 */
export function useTimeline<T extends TimelineItem>({
  canEdit = () => true,
  dateOnly = {},
  items,
  onMove,
  onResize,
  timeZone,
}: UseTimelineProps<T>) {
  const [overrides, setOverrides] = useState<Record<string, Pick<TimelineItem, 'end' | 'start'>>>(
    {},
  );

  const [drag, setDrag] = useState<TimelineDrag | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    setOverrides({});
  }, [items]);

  const apply = (item: T, next: TimelineDrag | null): T => {
    const override = overrides[item.id];
    const current = override ? { ...item, ...override } : item;
    if (!next || next.id !== item.id || next.days === 0) return current;
    const change =
      next.kind === 'move'
        ? moveTimelineItem(current, next.days, timeZone, dateOnly)
        : resizeTimelineItem(current, next.kind, next.days, timeZone, dateOnly);

    return { ...current, end: change.end, start: change.start };
  };

  const shown = items.map((item) => apply(item, drag));

  const commit = async (item: T, next: TimelineDrag) => {
    const current = apply(item, null);
    const change =
      next.kind === 'move'
        ? moveTimelineItem(current, next.days, timeZone, dateOnly)
        : resizeTimelineItem(current, next.kind, next.days, timeZone, dateOnly);

    if (change.start === current.start && change.end === current.end) return;
    setOverrides((value) => ({ ...value, [item.id]: { end: change.end, start: change.start } }));

    try {
      await (next.kind === 'move' ? onMove : onResize)?.({ ...change, item: current });
    } catch {
      setOverrides((value) => {
        const rest = { ...value };
        delete rest[item.id];

        return rest;
      });
    }
  };

  const begin = (
    item: T,
    kind: TimelineDrag['kind'],
    pointer: { button: number; clientX: number },
    dayWidth: number,
  ) => {
    dragged.current = false;
    if (pointer.button !== 0 || !canEdit(item) || dayWidth <= 0) return;
    const startX = pointer.clientX;
    let latest: TimelineDrag | null = null;

    const stop = () => {
      setDrag(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('keydown', cancel);
    };

    const move = (event: PointerEvent) => {
      const distance = event.clientX - startX;
      if (!dragged.current && Math.abs(distance) < DRAG_THRESHOLD) return;
      dragged.current = true;
      latest = { days: Math.round(distance / dayWidth), id: item.id, kind };
      setDrag(latest);
    };

    const finish = () => {
      const next = latest;
      stop();
      if (next && next.days !== 0) void commit(item, next);
    };

    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stop();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('keydown', cancel);
  };

  return {
    begin,
    drag,
    wasDragged: () => dragged.current,
    items: shown,
  };
}
