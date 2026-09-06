'use client';

import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import { useEffect, useRef, useState } from 'react';

export type BoardColumn = { key: string; label: string; value?: unknown };

export type BoardMove<T> = {
  after?: T;
  before?: T;
  from: string | null;
  row: T;
  to: string | null;
};

export type BoardPlacement = { height: number; index: number; key: string };

export type BoardDropData = { indexAt?: (clientY: number) => number };

export function resolveBoardDrop<T>({
  activeId,
  getId,
  index,
  rows,
}: {
  activeId: string;
  getId: (row: T) => string;
  index: number;
  rows: T[];
}) {
  const sourceIndex = rows.findIndex((row) => getId(row) === activeId);
  const targetRows = rows.filter((row) => getId(row) !== activeId);
  const at = Math.min(
    sourceIndex >= 0 && index > sourceIndex ? index - 1 : index,
    targetRows.length,
  );
  const order = targetRows.map(getId);
  order.splice(at, 0, activeId);
  return { after: targetRows[at], before: targetRows[at - 1], order };
}

export function isBoardNoopDrop({
  index,
  sourceIndex,
}: {
  index: number;
  sourceIndex: number;
}): boolean {
  return sourceIndex >= 0 && (index === sourceIndex || index === sourceIndex + 1);
}

export type UseBoardProps<T> = {
  columns: BoardColumn[];
  getId: (row: T) => string;
  groupBy: (row: T) => string | null | undefined;
  onMove?: (move: BoardMove<T>) => Promise<void> | void;
  allowReorder?: boolean;
  rows: T[];
  uncategorizedLabel?: string;
};

export function groupBoardRows<T>({
  columns,
  getId,
  groupBy,
  groupOverrides = {},
  orderOverrides = {},
  rows,
  uncategorizedLabel = 'Uncategorized',
}: UseBoardProps<T> & {
  groupOverrides?: Record<string, string | null>;
  orderOverrides?: Record<string, string[]>;
}) {
  return [...columns, { key: '', label: uncategorizedLabel }].map((column) => {
    const order = orderOverrides[column.key];
    const grouped = rows.filter((row) => {
      const id = getId(row);
      const group = Object.prototype.hasOwnProperty.call(groupOverrides, id)
        ? groupOverrides[id]
        : groupBy(row);
      return (group ?? '') === column.key;
    });
    return {
      ...column,
      rows: order
        ? [...grouped].sort((a, b) => order.indexOf(getId(a)) - order.indexOf(getId(b)))
        : grouped,
    };
  });
}

export function resolveBoardTarget<T>({
  getId,
  groupBy,
  groupOverrides = {},
  overId,
  rows,
}: Pick<UseBoardProps<T>, 'getId' | 'groupBy' | 'rows'> & {
  groupOverrides?: Record<string, string | null>;
  overId: string | null;
}): string | null {
  if (overId === null) return null;
  const overRow = rows.find((candidate) => getId(candidate) === overId);
  if (!overRow) return overId;
  const id = getId(overRow);
  const group = Object.prototype.hasOwnProperty.call(groupOverrides, id)
    ? groupOverrides[id]
    : groupBy(overRow);
  return group ?? '';
}

function pointerY({ activatorEvent, delta }: Pick<DragMoveEvent, 'activatorEvent' | 'delta'>) {
  const event = activatorEvent as { clientY?: number; touches?: { clientY: number }[] } | null;
  const start = event?.clientY ?? event?.touches?.[0]?.clientY;
  return start === undefined ? undefined : start + delta.y;
}

export function useBoard<T>({
  allowReorder = false,
  columns,
  getId,
  groupBy,
  onMove,
  rows,
  uncategorizedLabel = 'Uncategorized',
}: UseBoardProps<T>) {
  const [currentRows, setCurrentRows] = useState(rows);
  const [groupOverrides, setGroupOverrides] = useState<Record<string, string | null>>({});
  const [orderOverrides, setOrderOverrides] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeHeight, setActiveHeight] = useState(0);
  const [placement, setPlacement] = useState<BoardPlacement | null>(null);
  const placementRef = useRef<BoardPlacement | null>(null);
  useEffect(() => {
    setCurrentRows(rows);
    setGroupOverrides({});
    setOrderOverrides({});
  }, [rows]);

  const grouped = groupBoardRows({
    columns,
    getId,
    groupBy,
    groupOverrides,
    orderOverrides,
    rows: currentRows,
    uncategorizedLabel,
  });

  const resolveTarget = (overId: string | null) =>
    resolveBoardTarget({ getId, groupBy, groupOverrides, overId, rows: currentRows });

  const place = (next: BoardPlacement | null) => {
    placementRef.current = next;
    setPlacement(next);
  };

  const reset = () => {
    setActiveId(null);
    setActiveHeight(0);
    place(null);
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    const rect = active.rect.current.initial ?? active.rect.current.translated;
    setActiveId(String(active.id));
    setActiveHeight(rect?.height ?? 140);
  };
  const onDragMove = ({ activatorEvent, active, delta, over }: DragMoveEvent) => {
    const key = over ? resolveTarget(String(over.id)) : null;
    if (key === null) return place(null);
    const id = String(active.id);
    const sameColumn = key === resolveTarget(id);
    if (sameColumn && !allowReorder) return place(null);
    const column = grouped.find((candidate) => candidate.key === key);
    const columnRows = column?.rows ?? [];
    const y = pointerY({ activatorEvent, delta });
    const indexAt = (over?.data.current as BoardDropData | undefined)?.indexAt;
    const index = !allowReorder || y === undefined || !indexAt ? columnRows.length : indexAt(y);
    const sourceIndex = columnRows.findIndex((row) => getId(row) === id);
    if (sameColumn && isBoardNoopDrop({ index, sourceIndex })) return place(null);
    const rect = active.rect.current.initial ?? active.rect.current.translated;
    place({ height: rect?.height ?? 140, index, key });
  };
  const onDragCancel = reset;
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    const dropped = placementRef.current;
    reset();
    if (!over) return;
    const row = currentRows.find((candidate) => getId(candidate) === String(active.id));
    if (!row) return;
    const from = groupBy(row) ?? null;
    const to = resolveTarget(String(over.id)) || null;
    if (from === to && (!allowReorder || !dropped)) return;
    const id = getId(row);
    const targetColumn = grouped.find(({ key }) => key === (to ?? ''));
    const targetRows = targetColumn?.rows ?? [];
    const { after, before, order } = resolveBoardDrop({
      activeId: id,
      getId,
      index: dropped?.key === (to ?? '') ? dropped.index : targetRows.length,
      rows: targetRows,
    });
    setGroupOverrides((value) => ({ ...value, [id]: to }));
    setOrderOverrides((value) => ({ ...value, [to ?? '']: order }));
    try {
      await onMove?.({ after, before, from, row, to });
    } catch (error) {
      setGroupOverrides((value) => {
        const next = { ...value };
        delete next[id];
        return next;
      });
      setOrderOverrides((value) => {
        const next = { ...value };
        delete next[to ?? ''];
        return next;
      });
      throw error;
    }
  };

  return {
    activeHeight,
    activeId,
    columns: grouped,
    handlers: { onDragCancel, onDragEnd, onDragMove, onDragStart },
    placement,
  };
}
