'use client';

import { Calendar, getVisibleRange } from '@frogbotai/ui';
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
import type { CalendarMode } from 'frogbot';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ClientCollectionConfig, Column, TypeWithID } from 'payload';
import type { ComponentType } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { appendQuery, getPath, setPath, toCellData } from '../cells.js';
import { getViewCardColumns } from '../preferences.js';

type Row = Record<string, unknown> & {
  color?: string;
  end?: string;
  id: string;
  start: string;
};

function mergePaths(...values: Record<string, unknown>[]): Record<string, unknown> {
  return values.reduce<Record<string, unknown>>((result, value) => {
    for (const [key, item] of Object.entries(value)) {
      result[key] =
        item && typeof item === 'object' && !Array.isArray(item)
          ? mergePaths(
              (result[key] as Record<string, unknown>) ?? {},
              item as Record<string, unknown>,
            )
          : item;
    }
    return result;
  }, {});
}

function CalendarDocumentEvent({
  cardColumns,
  collectionConfig,
  collectionSlug,
  Event,
  onSave,
  row,
}: {
  cardColumns: Column[];
  collectionConfig: ClientCollectionConfig;
  collectionSlug: string;
  Event?: ComponentType<{ row: Row }>;
  onSave: (row: Row) => void;
  row: Row;
}) {
  const [DocumentDrawer, , drawer] = useDocumentDrawer({ collectionSlug, id: String(row.id) });
  const { i18n } = useTranslation();
  const { config } = useConfig();
  const title = formatDocTitle({
    collectionConfig,
    data: row as unknown as TypeWithID,
    dateFormat: config.admin.dateFormat,
    i18n,
  });
  return (
    <>
      <div onClick={drawer.openDrawer}>
        {Event ? (
          <Event row={row} />
        ) : (
          <>
            <div className="collection-calendar__title">{title}</div>
            {cardColumns.map(({ accessor, field }) => {
              const value = getPath(row, accessor);
              const cellData =
                field.type === 'relationship' || field.type === 'upload'
                  ? Array.isArray(value)
                    ? value.map(toCellData)
                    : toCellData(value)
                  : value;
              return (
                <div className="collection-calendar__field" key={accessor}>
                  <span className="collection-calendar__field-label">
                    {getTranslation(('label' in field ? field.label : undefined) || accessor, i18n)}
                  </span>
                  <span className="collection-calendar__field-value">
                    {accessor === 'id' ? (
                      String(cellData ?? '')
                    ) : (
                      <DefaultCell
                        cellData={cellData}
                        collectionSlug={collectionSlug}
                        field={field}
                        link={false}
                        rowData={row}
                        viewType="list"
                      />
                    )}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>
      <DocumentDrawer onSave={({ doc }) => onSave(doc as Row)} />
    </>
  );
}

export function CalendarViewClient({
  canCreate,
  canUpdate,
  collectionSlug,
  color,
  date,
  end,
  Event,
  filter,
  mode,
  modes,
  snap,
  start,
}: {
  canUpdate: boolean;
  canCreate: boolean;
  collectionSlug: string;
  color?: string;
  date: string;
  end?: string;
  Event?: ComponentType<{ row: Row }>;
  filter?: Record<string, unknown>;
  mode: CalendarMode;
  modes?: CalendarMode[];
  snap?: number;
  start: string;
}) {
  const { config, getEntityConfig } = useConfig();
  const { theme } = useTheme();
  const { query } = useListQuery();
  const { columns } = useTableColumns();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const collectionConfig = getEntityConfig({ collectionSlug }) as ClientCollectionConfig;
  const cardColumns = useMemo(
    () => getViewCardColumns(columns, collectionConfig.admin?.useAsTitle),
    [collectionConfig.admin?.useAsTitle, columns],
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [createRange, setCreateRange] = useState<{ end: string; start: string }>();
  const [CreateDrawer, , createDrawer] = useDocumentDrawer({ collectionSlug });
  const range = getVisibleRange({ date, mode });
  const whereKey = JSON.stringify(query.where ?? null);
  const searchKey = String(query.search ?? '');
  const normalizeRow = (row: Record<string, unknown>): Row => ({
    ...row,
    color: color ? String(getPath(row, color) ?? '') || undefined : undefined,
    end: end ? String(getPath(row, end) ?? '') || undefined : undefined,
    id: String(row.id),
    start: String(getPath(row, start)),
  });

  const load = async (signal?: AbortSignal) => {
    const params = new URLSearchParams({ depth: '1', limit: '1000', pagination: 'false' });
    const rangeWhere = {
      and: [
        { [start]: { less_than_equal: range.end } },
        end
          ? {
              or: [
                { [end]: { greater_than_equal: range.start } },
                {
                  and: [
                    { [end]: { exists: false } },
                    { [start]: { greater_than_equal: range.start } },
                  ],
                },
              ],
            }
          : { [start]: { greater_than_equal: range.start } },
      ],
    };
    appendQuery(params, 'where', { and: [filter, query.where, rangeWhere].filter(Boolean) });
    appendQuery(params, 'search', query.search);
    const response = await fetch(`${config.routes.api}/${collectionSlug}?${params}`, {
      credentials: 'include',
      signal,
    });
    if (!response.ok) throw new Error(response.statusText);
    const result = (await response.json()) as { docs: Row[]; totalDocs?: number };
    setRows(result.docs.map(normalizeRow));
    setTruncated(
      (result.totalDocs ?? result.docs.length) > result.docs.length || result.docs.length >= 1000,
    );
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error(error instanceof Error ? error.message : 'Failed to load calendar');
    });
    return () => controller.abort();
  }, [collectionSlug, date, mode, searchKey, whereKey]);

  const navigate = (key: 'date' | 'mode', value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`${pathname}?${params}`);
  };
  const request = async (row: Row, nextStart: string, nextEnd: string) => {
    const body = mergePaths(setPath(start, nextStart), ...(end ? [setPath(end, nextEnd)] : []));
    const response = await fetch(`${config.routes.api}/${collectionSlug}/${row.id}`, {
      body: JSON.stringify(body),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    });
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as {
        errors?: { message?: string }[];
        message?: string;
      };
      const message = result.errors?.[0]?.message ?? result.message ?? response.statusText;
      toast.error(message);
      throw new Error(message);
    }
    setRows((current) =>
      current.map((item) =>
        item.id === row.id ? { ...item, end: nextEnd, start: nextStart } : item,
      ),
    );
  };

  return (
    <RelationshipProvider>
      <ThemeProvider mode={theme}>
        <div className="collection-calendar">
          {truncated ? (
            <div className="collection-calendar__notice">
              Showing the first 1000 events in this range.
            </div>
          ) : null}
          <Calendar
            canEdit={() => canUpdate}
            date={date}
            events={rows}
            mode={mode}
            modes={modes}
            onCreate={
              canCreate
                ? (value) => {
                    setCreateRange(value);
                    createDrawer.openDrawer();
                  }
                : undefined
            }
            onMove={({ end: nextEnd, event, start: nextStart }) =>
              request(event, nextStart, nextEnd)
            }
            onNavigate={(value) => navigate('date', value)}
            onResize={({ end: nextEnd, event, start: nextStart }) =>
              request(event, nextStart, nextEnd)
            }
            onSetMode={(value) => navigate('mode', value)}
            renderEvent={(row) => (
              <CalendarDocumentEvent
                Event={Event}
                cardColumns={cardColumns}
                collectionConfig={collectionConfig}
                collectionSlug={collectionSlug}
                onSave={(saved) =>
                  setRows((current) =>
                    current.map((item) => (item.id === saved.id ? normalizeRow(saved) : item)),
                  )
                }
                row={row}
              />
            )}
            snap={snap}
          />
          <CreateDrawer
            initialData={
              createRange
                ? mergePaths(
                    setPath(start, createRange.start),
                    ...(end ? [setPath(end, createRange.end)] : []),
                  )
                : undefined
            }
            onSave={({ doc }) => setRows((current) => [...current, normalizeRow(doc)])}
          />
        </div>
      </ThemeProvider>
    </RelationshipProvider>
  );
}
