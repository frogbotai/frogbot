'use client';

import { useDroppable } from '@dnd-kit/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import type { BoardPlacement } from './useBoard.js';

const PLACEHOLDER_KEY = '__frog-board-placeholder';
const ROW_GAP = 8;

export function BoardColumn<T>({
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
  const drop = useDroppable({ id: columnKey });
  const placeholderIndex = placement?.index;
  const rowAt = (index: number) =>
    placeholderIndex === undefined || index < placeholderIndex ? rows[index] : rows[index - 1];
  const virtualizer = useVirtualizer({
    count: rows.length + (placement ? 1 : 0),
    estimateSize: (index) => (index === placeholderIndex ? placement!.height + ROW_GAP : 140),
    getItemKey: (index) => (index === placeholderIndex ? PLACEHOLDER_KEY : getId(rowAt(index)!)),
    getScrollElement: () => parent.current,
    overscan: 3,
  });
  const items = virtualizer.getVirtualItems();
  useEffect(() => {
    if (hasMore && (items.at(-1)?.index ?? -1) >= rows.length - 1) onReachEnd?.();
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
        <div className="frog-board__column-items" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((item) => (
            <div
              className="frog-board__virtual-row"
              data-index={item.index}
              key={item.key}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${item.start}px)` }}
            >
              {item.index === placeholderIndex ? (
                <div className="frog-board__placeholder" style={{ height: placement!.height }} />
              ) : (
                renderCard(rowAt(item.index)!)
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
