'use client';

import { useDroppable } from '@dnd-kit/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import type { BoardDropData, BoardPlacement } from './useBoard.js';

const ROW_GAP = 8;

export function BoardColumn<T>({
  activeHeight,
  activeId,
  columnKey,
  hasMore,
  label,
  onReachEnd,
  placement,
  renderCard,
  renderColumnHeader,
  rows,
  getId,
}: {
  activeHeight: number;
  activeId: string | null;
  columnKey: string;
  getId: (row: T) => string;
  hasMore?: boolean;
  label: string;
  onReachEnd?: () => void;
  placement?: BoardPlacement;
  renderCard: (row: T) => ReactNode;
  renderColumnHeader?: (column: { key: string; label: string }, count: number) => ReactNode;
  rows: T[];
}) {
  const parent = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 140,
    getItemKey: (index) => getId(rows[index]!),
    getScrollElement: () => parent.current,
    overscan: 3,
  });
  const indexAt = (clientY: number) => {
    const element = parent.current;
    if (!element) return rows.length;
    const offset = clientY - element.getBoundingClientRect().top + element.scrollTop;
    const item = virtualizer.getVirtualItemForOffset(offset);
    if (!item) return offset <= 0 ? 0 : rows.length;
    return offset < item.start + item.size / 2 ? item.index : item.index + 1;
  };
  const drop = useDroppable({ data: { indexAt } satisfies BoardDropData, id: columnKey });
  const items = virtualizer.getVirtualItems();
  const shift = placement ? placement.height + ROW_GAP : 0;
  const sourceIndex = activeId ? rows.findIndex((row) => getId(row) === activeId) : -1;
  const sourceShift = sourceIndex < 0 ? 0 : activeHeight + ROW_GAP;
  const placeholderTop = placement
    ? (virtualizer.measurementsCache[placement.index]?.start ?? virtualizer.getTotalSize()) -
      (placement.index > sourceIndex ? sourceShift : 0)
    : 0;
  useEffect(() => {
    if (hasMore && (items.at(-1)?.index ?? -1) >= rows.length - 1) onReachEnd?.();
  }, [hasMore, items, onReachEnd, rows.length]);
  return (
    <section
      className={`frog-board__column${placement ? ' frog-board__column--placing' : ''}`}
      ref={drop.setNodeRef}
    >
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
        <div
          className="frog-board__column-items"
          style={{ height: virtualizer.getTotalSize() - sourceShift + shift }}
        >
          {items.map((item) => (
            <div
              className="frog-board__virtual-row"
              data-index={item.index}
              key={item.key}
              ref={virtualizer.measureElement}
              style={{
                transform: `translateY(${item.start - (item.index > sourceIndex ? sourceShift : 0) + (placement && item.index >= placement.index ? shift : 0)}px)`,
              }}
            >
              {item.index === sourceIndex ? (
                <div className="frog-board__source-spacer" style={{ height: activeHeight }} />
              ) : (
                renderCard(rows[item.index]!)
              )}
            </div>
          ))}
          {placement ? (
            <div
              className="frog-board__placeholder"
              style={{ height: placement.height, transform: `translateY(${placeholderTop}px)` }}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
