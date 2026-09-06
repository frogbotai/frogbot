'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

export function BoardColumn<T>({
  columnKey,
  hasMore,
  label,
  onReachEnd,
  renderCard,
  renderColumnHeader,
  rows,
  getId,
}: {
  columnKey: string;
  getId: (row: T) => string;
  hasMore?: boolean;
  label: string;
  onReachEnd?: () => void;
  renderCard: (row: T) => ReactNode;
  renderColumnHeader?: (column: { key: string; label: string }, count: number) => ReactNode;
  rows: T[];
}) {
  const parent = useRef<HTMLDivElement>(null);
  const drop = useDroppable({ id: columnKey });
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 140,
    getScrollElement: () => parent.current,
    overscan: 3,
  });
  const items = virtualizer.getVirtualItems();
  useEffect(() => {
    if (hasMore && items.at(-1)?.index === rows.length - 1) onReachEnd?.();
  }, [hasMore, items, onReachEnd, rows.length]);
  return (
    <section className="frog-board__column" ref={drop.setNodeRef}>
      <header className="frog-board__column-header">
        {renderColumnHeader ? (
          renderColumnHeader({ key: columnKey, label }, rows.length)
        ) : (
          <>
            <strong>{label}</strong>
            <span>{rows.length}</span>
          </>
        )}
      </header>
      <div className="frog-board__column-scroll" ref={parent}>
        <SortableContext items={rows.map(getId)} strategy={verticalListSortingStrategy}>
          <div className="frog-board__column-items" style={{ height: virtualizer.getTotalSize() }}>
            {items.map((item) => (
              <div
                className="frog-board__virtual-row"
                key={getId(rows[item.index]!)}
                style={{ transform: `translateY(${item.start}px)` }}
              >
                {renderCard(rows[item.index]!)}
              </div>
            ))}
          </div>
        </SortableContext>
      </div>
    </section>
  );
}
