'use client';

import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { ReactNode } from 'react';

import { BoardColumn } from './BoardColumn.js';
import { useBoard, type UseBoardProps } from './useBoard.js';

export type BoardProps<T> = UseBoardProps<T> & {
  hasMore?: Record<string, boolean>;
  onReachEnd?: (key: string) => void;
  renderCard: (row: T) => ReactNode;
  renderColumnHeader?: (column: { key: string; label: string }, count: number) => ReactNode;
};

export function Board<T>(props: BoardProps<T>) {
  const board = useBoard(props);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const active = props.rows.find((row) => props.getId(row) === board.activeId);
  return (
    <DndContext sensors={sensors} {...board.handlers}>
      <div className="frog-board">
        {board.columns.map((column) => (
          <BoardColumn
            key={column.key}
            columnKey={column.key}
            getId={props.getId}
            hasMore={props.hasMore?.[column.key]}
            label={column.label}
            onReachEnd={() => props.onReachEnd?.(column.key)}
            renderCard={props.renderCard}
            renderColumnHeader={props.renderColumnHeader}
            rows={column.rows}
          />
        ))}
      </div>
      <DragOverlay>
        {active ? <div className="frog-board__overlay">{props.renderCard(active)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
