'use client';

import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useEffect, useState } from 'react';

export type BoardColumn = { key: string; label: string; value?: unknown };

export type BoardMove<T> = {
  from: string | null;
  row: T;
  to: string | null;
};

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

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));
  const onDragCancel = () => setActiveId(null);
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const row = currentRows.find((candidate) => getId(candidate) === String(active.id));
    if (!row) return;
    const from = groupBy(row) ?? null;
    const overRow = currentRows.find((candidate) => getId(candidate) === String(over.id));
    const to = overRow ? (groupBy(overRow) ?? null) : String(over.id) || null;
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
    handlers: { onDragCancel, onDragEnd, onDragStart },
  };
}
