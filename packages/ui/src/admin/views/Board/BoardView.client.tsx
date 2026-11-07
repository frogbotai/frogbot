'use client';

import {
  RelationshipProvider,
  toast,
  useConfig,
  useListQuery,
  useTableColumns,
} from '@payloadcms/ui';
import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react';

import { Board, type BoardColumnState } from '../../../board/Board.js';
import { appendQuery, getPath, setPath } from '../cells.js';
import { getViewCardColumns } from '../preferences.js';
import { BoardDocumentCard, type BoardRow } from './BoardDocumentCard.js';
import { buildBoardReorderBody, buildColumnWhere } from './data.js';
import type { ResolvedBoardColumn } from './resolveColumns.js';
import { getBoardGroupKey } from './totals.js';
import { useBoardColumnState } from './useBoardColumnState.js';
import { useBoardTotals } from './useBoardTotals.js';

type Row = BoardRow;

export type BoardViewClientProps = {
  Card?: ComponentType<{ disabled: boolean; row: Row }>;
  ColumnHeader?: ComponentType<{ column: ResolvedBoardColumn; count: number }>;
  collectionSlug: string;
  columnState: BoardColumnState;
  columns: ResolvedBoardColumn[];
  cover?: string;
  filter?: Record<string, unknown>;
  groupBy: string;
  limit: number;
  orderField: string;
  canUpdate: boolean;
  viewSlug: string;
};

export function BoardViewClient(props: BoardViewClientProps) {
  const Card = props.Card;
  const ColumnHeader = props.ColumnHeader;
  const { query } = useListQuery();
  const isManual = query.sort === props.orderField;
  const { config, getEntityConfig } = useConfig();
  const { columns: columnState } = useTableColumns();
  const collectionConfig = getEntityConfig({
    collectionSlug: props.collectionSlug,
  });

  const useAsTitle = collectionConfig.admin?.useAsTitle;
  const cardColumns = useMemo(
    () => getViewCardColumns(columnState, useAsTitle),
    [columnState, useAsTitle],
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [pages, setPages] = useState<Record<string, number>>({});
  const [hasMore, setHasMore] = useState<Record<string, boolean>>({});
  const where = props.filter ? { and: [props.filter, query.where].filter(Boolean) } : query.where;
  const totals = useBoardTotals({
    api: config.routes.api,
    collectionSlug: props.collectionSlug,
    groupBy: props.groupBy,
    where,
  });

  const [boardColumns, setBoardColumns] = useBoardColumnState({
    collectionSlug: props.collectionSlug,
    initial: props.columnState,
    viewSlug: props.viewSlug,
  });

  const groupKey = (row: Row) => getBoardGroupKey(getPath(row, props.groupBy));

  const fetchColumn = async (key: string, page: number, replace = false) => {
    const value = props.columns.find((column) => column.key === key)?.value;
    const params = new URLSearchParams({
      depth: '1',
      limit: String(props.limit),
      page: String(page),
    });

    appendQuery(params, 'where', buildColumnWhere(where, props.groupBy, value));
    appendQuery(params, 'sort', query.sort);
    const response = await fetch(`${config.routes.api}/${props.collectionSlug}?${params}`, {
      credentials: 'include',
    });

    if (!response.ok) throw new Error(response.statusText);
    const result = (await response.json()) as { docs: Row[]; hasNextPage: boolean };

    setRows((current) =>
      replace
        ? [...current.filter((row) => groupKey(row) !== key), ...result.docs]
        : [...current, ...result.docs.filter((doc) => !current.some(({ id }) => id === doc.id))],
    );

    setPages((current) => ({ ...current, [key]: page }));
    setHasMore((current) => ({ ...current, [key]: result.hasNextPage }));
  };

  const loadBoard = () => {
    setRows([]);

    void Promise.all([
      ...[...props.columns.map(({ key }) => key), ''].map((key) => fetchColumn(key, 1, true)),
      totals.refresh(),
    ]).catch((error) =>
      toast.error(error instanceof Error ? error.message : 'Failed to load board'),
    );
  };

  const loadBoardRef = useRef(loadBoard);

  useEffect(() => {
    loadBoardRef.current = loadBoard;
  });

  useEffect(() => {
    loadBoardRef.current();
  }, [query.sort, query.where]);

  const request = async (path: string, init: RequestInit) => {
    const response = await fetch(`${config.routes.api}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });

    const result = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
      errors?: { message?: string }[];
    };

    if (!response.ok) {
      const message = String(
        result.errors?.[0]?.message ?? result.error ?? result.message ?? response.statusText,
      );

      toast.error(message);
      throw new Error(message);
    }

    return result;
  };

  const reorder = async (row: Row, target: Row, before: boolean) => {
    const body = buildBoardReorderBody({
      before,
      collectionSlug: props.collectionSlug,
      orderField: props.orderField,
      rowId: row.id,
      target,
    });

    const result = await request('/reorder', { body: JSON.stringify(body), method: 'POST' });
    if (result.message !== 'initial migration') return;
    const fresh = (await request(
      `/${props.collectionSlug}/${target.id}?depth=0&select[${props.orderField}]=true`,
      { method: 'GET' },
    )) as Row;

    if (fresh[props.orderField]) await reorder(row, fresh, before);
  };

  const move = async ({
    after,
    before,
    from,
    row,
    to,
  }: {
    after?: Row;
    before?: Row;
    from: string | null;
    row: Row;
    to: string | null;
  }) => {
    if (from !== to) {
      const value = props.columns.find((column) => column.key === to)?.value ?? null;

      totals.adjust(from ?? '', -1);
      totals.adjust(to ?? '', 1);

      await request(`/${props.collectionSlug}/${row.id}`, {
        body: JSON.stringify(setPath(props.groupBy, value)),
        method: 'PATCH',
      }).catch((error: unknown) => {
        void totals.refresh();
        throw error;
      });
    }

    const target = before ?? after;
    if (isManual && target) await reorder(row, target, Boolean(before));

    await Promise.all([
      ...[...new Set([from ?? '', to ?? ''])].map((key) => fetchColumn(key, 1, true)),
      ...(from === to ? [] : [totals.refresh()]),
    ]);
  };

  const replaceRow = (doc: Row) => {
    setRows((current) => current.map((row) => (row.id === doc.id ? doc : row)));
    void totals.refresh();
  };

  const removeRow = (doc: Row) => {
    setRows((current) => current.filter((row) => row.id !== doc.id));
    void totals.refresh();
  };

  return (
    <RelationshipProvider>
      <div className="collection-board">
        <Board
          allowReorder={isManual}
          columnState={boardColumns}
          columns={props.columns}
          getId={(row) => String(row.id)}
          groupBy={(row) => groupKey(row) || null}
          hasMore={hasMore}
          onColumnStateChange={setBoardColumns}
          renderColumnHeader={
            ColumnHeader
              ? (column, count) => (
                  <ColumnHeader
                    column={{
                      ...column,
                      value: props.columns.find(({ key }) => key === column.key)?.value,
                    }}
                    count={count}
                  />
                )
              : undefined
          }
          onMove={move}
          onReachEnd={(key) => void fetchColumn(key, (pages[key] ?? 1) + 1)}
          renderCard={(row) =>
            Card ? (
              <Card disabled={!props.canUpdate} row={row} />
            ) : (
              <BoardDocumentCard
                cardColumns={cardColumns}
                collectionConfig={collectionConfig}
                collectionSlug={props.collectionSlug}
                cover={props.cover}
                disabled={!props.canUpdate}
                onDelete={removeRow}
                onSave={replaceRow}
                row={row}
              />
            )
          }
          rows={rows}
          totals={totals.totals}
        />
      </div>
    </RelationshipProvider>
  );
}
