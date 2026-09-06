'use client';

import { Board, BoardCard } from '@frogbotai/ui';
import { ThemeProvider } from '@frogbotai/ui/theme';
import { getTranslation } from '@payloadcms/translations';
import {
  DefaultCell,
  RelationshipProvider,
  toast,
  useConfig,
  useDocumentDrawer,
  useListQuery,
  useTableColumns,
  useTheme,
  useTranslation,
} from '@payloadcms/ui';
import { formatDocTitle } from '@payloadcms/ui/shared';
import type { ClientCollectionConfig, Column, TypeWithID } from 'payload';
import { type ComponentType, useEffect, useMemo, useState } from 'react';

import {
  appendQuery,
  buildColumnWhere,
  getBoardCardColumns,
  getBoardColumnKey,
  getBoardColumnValue,
  getPath,
  setPath,
} from './data.js';
import type { ResolvedBoardColumn } from './resolveColumns.js';

type Row = Record<string, unknown> & { id: number | string };
export type BoardViewClientProps = {
  Card?: ComponentType<{ disabled: boolean; row: Row }>;
  ColumnHeader?: ComponentType<{ column: ResolvedBoardColumn; count: number }>;
  collectionSlug: string;
  columns: ResolvedBoardColumn[];
  cover?: string;
  filter?: Record<string, unknown>;
  groupBy: string;
  limit: number;
  canUpdate: boolean;
};

function BoardDocumentCard({
  cardColumns,
  collectionConfig,
  collectionSlug,
  cover,
  disabled,
  row,
}: Pick<BoardViewClientProps, 'collectionSlug' | 'cover'> & {
  cardColumns: Column[];
  collectionConfig: ClientCollectionConfig;
  disabled: boolean;
  row: Row;
}) {
  const [DocumentDrawer, , drawer] = useDocumentDrawer({ collectionSlug, id: String(row.id) });
  const { i18n } = useTranslation();
  const {
    config: {
      admin: { dateFormat },
    },
  } = useConfig();
  const title = formatDocTitle({
    collectionConfig,
    data: row as unknown as TypeWithID,
    dateFormat,
    i18n,
  });

  return (
    <>
      <BoardCard disabled={disabled} id={String(row.id)} onClick={drawer.openDrawer}>
        {cover ? (
          <img
            alt=""
            className="collection-board__cover"
            src={String((getPath(row, cover) as { url?: unknown } | undefined)?.url ?? '')}
          />
        ) : null}
        <div className="collection-board__title">{title}</div>
        {cardColumns.map(({ accessor, field }) => {
          const value = getPath(row, accessor);
          const cellData =
            field.type === 'relationship' || field.type === 'upload'
              ? Array.isArray(value)
                ? value.map(getBoardColumnValue)
                : getBoardColumnValue(value)
              : value;
          return (
            <div className="collection-board__field" key={accessor}>
              <span className="collection-board__field-label">
                {getTranslation(('label' in field ? field.label : undefined) || accessor, i18n)}
              </span>
              <div className="collection-board__field-value">
                {accessor === 'id' ? (
                  String(cellData ?? '')
                ) : (
                  <DefaultCell
                    cellData={cellData}
                    collectionSlug={collectionSlug}
                    field={field}
                    link={false}
                    rowData={row}
                    viewType="board"
                  />
                )}
              </div>
            </div>
          );
        })}
      </BoardCard>
      <DocumentDrawer />
    </>
  );
}

export function BoardViewClient(props: BoardViewClientProps) {
  const Card = props.Card;
  const ColumnHeader = props.ColumnHeader;
  const { query } = useListQuery();
  const { config, getEntityConfig } = useConfig();
  const { theme } = useTheme();
  const { columns: columnState } = useTableColumns();
  const collectionConfig = getEntityConfig({
    collectionSlug: props.collectionSlug,
  }) as ClientCollectionConfig;
  const useAsTitle = collectionConfig.admin?.useAsTitle;
  const cardColumns = useMemo(
    () => getBoardCardColumns(columnState, useAsTitle),
    [columnState, useAsTitle],
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [pages, setPages] = useState<Record<string, number>>({});
  const [hasMore, setHasMore] = useState<Record<string, boolean>>({});

  const fetchColumn = async (key: string, page: number, replace = false) => {
    const value = props.columns.find((column) => column.key === key)?.value;
    const params = new URLSearchParams({
      depth: '1',
      limit: String(props.limit),
      page: String(page),
    });
    const where = props.filter ? { and: [props.filter, query.where].filter(Boolean) } : query.where;
    appendQuery(params, 'where', buildColumnWhere(where, props.groupBy, value));
    appendQuery(params, 'sort', query.sort);
    const response = await fetch(`${config.routes.api}/${props.collectionSlug}?${params}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error(response.statusText);
    const result = (await response.json()) as { docs: Row[]; hasNextPage: boolean };
    setRows((current) =>
      replace
        ? [
            ...current.filter((row) => {
              const value = getBoardColumnValue(getPath(row, props.groupBy));
              return (
                (value === null || value === undefined ? '' : getBoardColumnKey(value)) !== key
              );
            }),
            ...result.docs,
          ]
        : [...current, ...result.docs.filter((doc) => !current.some(({ id }) => id === doc.id))],
    );
    setPages((current) => ({ ...current, [key]: page }));
    setHasMore((current) => ({ ...current, [key]: result.hasNextPage }));
  };

  useEffect(() => {
    setRows([]);
    void Promise.all(
      [...props.columns.map(({ key }) => key), ''].map((key) => fetchColumn(key, 1, true)),
    ).catch((error) =>
      toast.error(error instanceof Error ? error.message : 'Failed to load board'),
    );
  }, [query.sort, query.where]);

  const move = async ({ row, to }: { row: Row; to: string | null }) => {
    const value = props.columns.find((column) => column.key === to)?.value ?? null;
    const response = await fetch(`${config.routes.api}/${props.collectionSlug}/${row.id}`, {
      body: JSON.stringify(setPath(props.groupBy, value)),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    });
    const result = (await response.json().catch(() => ({}))) as {
      doc?: Row;
      errors?: { message?: string }[];
      message?: string;
    };
    if (!response.ok) {
      const message = result.errors?.[0]?.message ?? result.message ?? response.statusText;
      toast.error(message);
      throw new Error(message);
    }
    setRows((current) => current.map((item) => (item.id === row.id ? (result.doc ?? item) : item)));
  };

  return (
    <RelationshipProvider>
      <ThemeProvider mode={theme}>
        <div className="collection-board">
          <Board
            columns={props.columns}
            getId={(row) => String(row.id)}
            groupBy={(row) => {
              const value = getBoardColumnValue(getPath(row, props.groupBy));
              return value === null || value === undefined ? null : getBoardColumnKey(value);
            }}
            hasMore={hasMore}
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
                  row={row}
                />
              )
            }
            rows={rows}
          />
        </div>
      </ThemeProvider>
    </RelationshipProvider>
  );
}
