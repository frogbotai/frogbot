'use client';

import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { useEffect, useState } from 'react';

export type BoardColumn = { key: string; label: string; value?: unknown };

export type BoardMove<T> = {
  from: string | null;
  row: T;
  to: string | null;
};

export type BoardPlacement = { height: number; index: number; key: string };

export type UseBoardProps<T> = {
  columns: BoardColumn[];
  getId: (row: T) => string;
  groupBy: (row: T) => string | null | undefined;
  onMove?: (move: BoardMove<T>) => Promise<void> | void;
  rows: T[];
  uncategorizedLabel?: string;
};

export function groupBoardRows<T>({
  columns,
  getId,
  groupBy,
  groupOverrides = {},
  rows,
  uncategorizedLabel = 'Uncategorized',
}: UseBoardProps<T> & { groupOverrides?: Record<string, string | null> }) {
  return [...columns, { key: '', label: uncategorizedLabel }].map((column) => ({
    ...column,
    rows: rows.filter((row) => {
      const id = getId(row);
      const group = Object.prototype.hasOwnProperty.call(groupOverrides, id)
        ? groupOverrides[id]
        : groupBy(row);
      return (group ?? '') === column.key;
    }),
  }));
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

export function useBoard<T>({
  columns,
  getId,
  groupBy,
  onMove,
  rows,
  uncategorizedLabel = 'Uncategorized',
}: UseBoardProps<T>) {
  const [currentRows, setCurrentRows] = useState(rows);
  const [groupOverrides, setGroupOverrides] = useState<Record<string, string | null>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<BoardPlacement | null>(null);
  useEffect(() => {
    setCurrentRows(rows);
    setGroupOverrides({});
  }, [rows]);

  const grouped = groupBoardRows({
    columns,
    getId,
    groupBy,
    groupOverrides,
    rows: currentRows,
    uncategorizedLabel,
  });

  const resolveTarget = (overId: string | null) =>
    resolveBoardTarget({ getId, groupBy, groupOverrides, overId, rows: currentRows });

  const reset = () => {
    setActiveId(null);
    setPlacement(null);
  };

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));
  const onDragOver = ({ active, over }: DragOverEvent) => {
    const key = over ? resolveTarget(String(over.id)) : null;
    if (key === null || key === resolveTarget(String(active.id))) return setPlacement(null);
    const rect = active.rect.current.initial ?? active.rect.current.translated;
    const column = grouped.find((candidate) => candidate.key === key);
    setPlacement({ height: rect?.height ?? 140, index: column?.rows.length ?? 0, key });
  };
  const onDragCancel = reset;
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    reset();
    if (!over) return;
    const row = currentRows.find((candidate) => getId(candidate) === String(active.id));
    if (!row) return;
    const from = groupBy(row) ?? null;
    const to = resolveTarget(String(over.id)) || null;
    if (from === to) return;
    const id = getId(row);
    setGroupOverrides((value) => ({ ...value, [id]: to }));
    try {
      await onMove?.({ from, row, to });
    } catch (error) {
      setGroupOverrides((value) => {
        const next = { ...value };
        delete next[id];
        return next;
      });
      throw error;
    }
  };

  return {
    activeId,
    columns: grouped,
    handlers: { onDragCancel, onDragEnd, onDragOver, onDragStart },
    placement,
  };
}
