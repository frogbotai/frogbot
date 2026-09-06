'use client';

import { Board, BoardCard } from '@frogbotai/ui';
import { ThemeProvider } from '@frogbotai/ui/theme';
import {
  DefaultCell,
  RelationshipProvider,
  toast,
  useConfig,
  useDocumentDrawer,
  useListQuery,
  useTheme,
} from '@payloadcms/ui';
import type { ClientField } from 'payload';
import { type ComponentType, useEffect, useState } from 'react';

import {
  appendQuery,
  buildColumnWhere,
  getBoardColumnKey,
  getBoardColumnValue,
  getPath,
  getPathField,
  setPath,
} from './data.js';
import type { ResolvedBoardColumn } from './resolveColumns.js';

type Row = Record<string, unknown> & { id: number | string };
export type BoardViewClientProps = {
  Card?: ComponentType<{ disabled: boolean; row: Row }>;
  ColumnHeader?: ComponentType<{ column: ResolvedBoardColumn; count: number }>;
  cardFields: string[];
  collectionSlug: string;
  columns: ResolvedBoardColumn[];
  cover?: string;
  filter?: Record<string, unknown>;
  groupBy: string;
  limit: number;
  sort?: string | string[];
  canUpdate: boolean;
};

function BoardDocumentCard({
  cardFields,
  collectionSlug,
  cover,
  disabled,
  fields,
  row,
}: Pick<BoardViewClientProps, 'cardFields' | 'collectionSlug' | 'cover'> & {
  disabled: boolean;
  fields: ClientField[];
  row: Row;
}) {
  const [DocumentDrawer, , drawer] = useDocumentDrawer({ collectionSlug, id: String(row.id) });
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
        {cardFields.map((path) => {
          const field = getPathField(fields as never, path) as ClientField | undefined;
          if (!field) return null;
          const value = getPath(row, path);
          const cellData =
            field.type === 'relationship' || field.type === 'upload'
              ? Array.isArray(value)
                ? value.map(getBoardColumnValue)
                : getBoardColumnValue(value)
              : value;
          return (
            <div className="collection-board__field" key={path}>
              <DefaultCell
                cellData={cellData}
                collectionSlug={collectionSlug}
                field={field}
                link={false}
                rowData={row}
                viewType="board"
              />
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
  const fields = getEntityConfig({ collectionSlug: props.collectionSlug }).fields;
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
    appendQuery(params, 'sort', query.sort ?? props.sort);
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
                  cardFields={props.cardFields}
                  collectionSlug={props.collectionSlug}
                  cover={props.cover}
                  disabled={!props.canUpdate}
                  fields={fields}
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
