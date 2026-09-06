'use client';

import {
  type CollisionDetection,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { ReactNode } from 'react';

import { BoardColumn } from './BoardColumn.js';
import { useBoard, type UseBoardProps } from './useBoard.js';

export type BoardProps<T> = UseBoardProps<T> & {
  hasMore?: Record<string, boolean>;
  onReachEnd?: (key: string) => void;
  renderCard: (row: T) => ReactNode;
  renderColumnHeader?: (column: { key: string; label: string }, count: number) => ReactNode;
};

const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length ? within : rectIntersection(args);
};

export function Board<T>(props: BoardProps<T>) {
  const board = useBoard(props);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const active = props.rows.find((row) => props.getId(row) === board.activeId);
  return (
    <DndContext collisionDetection={collisionDetection} sensors={sensors} {...board.handlers}>
      <div className="frog-board">
        {board.columns.map((column) => (
          <BoardColumn
            columnKey={column.key}
            getId={props.getId}
            hasMore={props.hasMore?.[column.key]}
            key={column.key}
            activeHeight={board.activeHeight}
            activeId={board.activeId}
            placement={board.placement?.key === column.key ? board.placement : undefined}
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
