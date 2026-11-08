'use client';

import { useDroppable } from '@dnd-kit/core';
import type { OptionColor } from '@frogbotai/protocol';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/dropdown-menu.js';
import { OptionPill } from '../components/option-pill.js';
import MoreHorizontalIcon from '../icons/icons/MoreHorizontalIcon.js';
import type { BoardDropData, BoardPlacement } from './useBoard.js';

const ROW_GAP = 8;

/** A board column as `renderColumnHeader`, `renderColumnEnd` and `renderColumnFooter` see it. */
export type BoardColumnInfo = { color?: OptionColor; key: string; label: string };

/** Props for one board column. */
export type BoardColumnProps<T> = {
  activeHeight: number;
  activeId: string | null;
  collapsed?: boolean;
  color?: OptionColor;
  columnKey: string;
  count?: number;
  emptyLabel?: string;
  end?: ReactNode;
  footer?: ReactNode;
  getId: (row: T) => string;
  hasMore?: boolean;
  label: string;
  onCollapsedChange?: (collapsed: boolean) => void;
  onHide?: () => void;
  onReachEnd?: () => void;
  placement?: BoardPlacement;
  renderCard: (row: T) => ReactNode;
  renderColumnHeader?: (column: BoardColumnInfo, count: number) => ReactNode;
  rows: T[];
};

export function BoardColumn<T>({
  activeHeight,
  activeId,
  collapsed = false,
  color,
  columnKey,
  count,
  emptyLabel = 'No cards',
  end,
  footer,
  hasMore,
  label,
  onCollapsedChange,
  onHide,
  onReachEnd,
  placement,
  renderCard,
  renderColumnHeader,
  rows,
  getId,
}: BoardColumnProps<T>) {
  const parent = useRef<HTMLDivElement>(null);
  const total = count ?? rows.length;
  const virtualizer = useVirtualizer({
    count: collapsed ? 0 : rows.length,
    estimateSize: () => 140,
    getItemKey: (index) => getId(rows[index]),
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

  const isEmpty = rows.length === 0;

  useEffect(() => {
    if (!collapsed && hasMore && (items.at(-1)?.index ?? -1) >= rows.length - 1) onReachEnd?.();
  }, [collapsed, hasMore, items, onReachEnd, rows.length]);

  const title = color ? <OptionPill color={color}>{label}</OptionPill> : <strong>{label}</strong>;

  if (collapsed) {
    return (
      <section
        aria-label={label}
        className={`frog-board__column frog-board__column--collapsed${placement ? ' frog-board__column--placing' : ''}`}
        ref={drop.setNodeRef}
      >
        <button
          aria-expanded={false}
          aria-label={`Expand ${label}`}
          className="frog-board__strip"
          onClick={() => onCollapsedChange?.(false)}
          type="button"
        >
          <span className="frog-board__column-count">{total}</span>
          <span className="frog-board__strip-label">{label}</span>
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label={label}
      className={`frog-board__column${placement ? ' frog-board__column--placing' : ''}`}
      ref={drop.setNodeRef}
    >
      <header className="frog-board__column-header">
        <div className="frog-board__column-title">
          {renderColumnHeader ? (
            renderColumnHeader({ color, key: columnKey, label }, total)
          ) : (
            <>
              {title}
              <span className="frog-board__column-count">{total}</span>
            </>
          )}
        </div>
        {onCollapsedChange || onHide ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`${label} column options`}
              className="frog-board__column-menu"
            >
              <MoreHorizontalIcon aria-hidden size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onCollapsedChange ? (
                <DropdownMenuItem onSelect={() => onCollapsedChange(true)}>
                  Collapse column
                </DropdownMenuItem>
              ) : null}
              {onHide ? <DropdownMenuItem onSelect={onHide}>Hide column</DropdownMenuItem> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>
      <div className="frog-board__column-scroll" ref={parent}>
        {isEmpty && !placement ? <div className="frog-board__empty">{emptyLabel}</div> : null}
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
                renderCard(rows[item.index])
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
        {end}
      </div>
      {footer ? <footer className="frog-board__column-footer">{footer}</footer> : null}
    </section>
  );
}
