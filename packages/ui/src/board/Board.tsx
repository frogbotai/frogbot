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

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/dropdown-menu.js';
import { BoardColumn, type BoardColumnInfo } from './BoardColumn.js';
import { useBoard, type UseBoardProps } from './useBoard.js';

/** Which columns are collapsed to a strip and which are hidden, by column key. */
export type BoardColumnState = { collapsed: string[]; hidden: string[] };

export type BoardProps<T> = UseBoardProps<T> & {
  columnState?: BoardColumnState;
  emptyLabel?: string;
  hasMore?: Record<string, boolean>;
  onColumnStateChange?: (state: BoardColumnState) => void;
  onReachEnd?: (key: string) => void;
  renderCard: (row: T) => ReactNode;
  renderColumnEnd?: (column: BoardColumnInfo) => ReactNode;
  renderColumnFooter?: (column: BoardColumnInfo) => ReactNode;
  renderColumnHeader?: (column: BoardColumnInfo, count: number) => ReactNode;
  totals?: Record<string, number>;
};

const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);

  return within.length ? within : rectIntersection(args);
};

const toggle = (keys: string[], key: string, on: boolean) =>
  on ? [...keys.filter((value) => value !== key), key] : keys.filter((value) => value !== key);

export function Board<T>(props: BoardProps<T>) {
  const board = useBoard(props);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const active = props.rows.find((row) => props.getId(row) === board.activeId);
  const state = props.columnState ?? { collapsed: [], hidden: [] };
  const onChange = props.onColumnStateChange;
  const hidden = board.columns.filter(({ key }) => state.hidden.includes(key));

  const setCollapsed = (key: string, collapsed: boolean) =>
    onChange?.({ ...state, collapsed: toggle(state.collapsed, key, collapsed) });

  const setHidden = (keys: string[], on: boolean) =>
    onChange?.({
      collapsed: state.collapsed,
      hidden: keys.reduce((current, key) => toggle(current, key, on), state.hidden),
    });

  return (
    <DndContext collisionDetection={collisionDetection} sensors={sensors} {...board.handlers}>
      <div className="frog-board">
        {board.columns
          .filter(({ key }) => !state.hidden.includes(key))
          .map((column) => {
            const info = { color: column.color, key: column.key, label: column.label };

            return (
              <BoardColumn
                collapsed={state.collapsed.includes(column.key)}
                color={column.color}
                columnKey={column.key}
                count={props.totals?.[column.key]}
                emptyLabel={props.emptyLabel}
                end={props.renderColumnEnd?.(info)}
                footer={props.renderColumnFooter?.(info)}
                getId={props.getId}
                hasMore={props.hasMore?.[column.key]}
                key={column.key}
                activeHeight={board.activeHeight}
                activeId={board.activeId}
                placement={board.placement?.key === column.key ? board.placement : undefined}
                label={column.label}
                onCollapsedChange={
                  onChange ? (collapsed) => setCollapsed(column.key, collapsed) : undefined
                }
                onHide={onChange ? () => setHidden([column.key], true) : undefined}
                onReachEnd={() => props.onReachEnd?.(column.key)}
                renderCard={props.renderCard}
                renderColumnHeader={props.renderColumnHeader}
                rows={column.rows}
              />
            );
          })}
        {hidden.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="frog-board__hidden">
              Hidden · {hidden.length}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {hidden.map((column) => (
                <DropdownMenuItem key={column.key} onSelect={() => setHidden([column.key], false)}>
                  Show {column.label}
                </DropdownMenuItem>
              ))}
              {hidden.length > 1 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() =>
                      setHidden(
                        hidden.map(({ key }) => key),
                        false,
                      )
                    }
                  >
                    Show all
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <DragOverlay>
        {active ? <div className="frog-board__overlay">{props.renderCard(active)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
