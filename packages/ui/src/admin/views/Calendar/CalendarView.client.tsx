'use client';

import { getTranslation } from '@payloadcms/translations';
import {
  RelationshipProvider,
  toast,
  useConfig,
  useListQuery,
  usePathname,
  useRouter,
  useSearchParams,
  useTableColumns,
  useTranslation,
} from '@payloadcms/ui';
import { formatDocTitle } from '@payloadcms/ui/shared';
import type { CalendarMode, OptionColor } from 'frogbot';
import type { ClientCollectionConfig, Column } from 'payload';
import type { ComponentType } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Calendar } from '../../../calendar/Calendar.js';
import { getFloatingRange, getVisibleRange } from '../../../calendar/core/index.js';
import { useBrowserTimeZone } from '../../../calendar/useBrowserTimeZone.js';
import CheckmarkCircleIcon from '../../../icons/icons/CheckmarkCircleIcon.js';
import { FieldCell } from '../../fields/FieldCell/index.client.js';
import { appendQuery, getPath, setPath } from '../cells.js';
import { useRecordPanel, useRecordPanelEvents } from '../panel/RecordPanelProvider.client.js';
import { getViewCardColumns } from '../preferences.js';
import { getUseAsDone, isRecordDone, recordClassName } from '../records/state.js';
import { getRangeWhere, resolveEventColor } from './data.js';

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
  row,
}: {
  cardColumns: Column[];
  collectionConfig: ClientCollectionConfig;
  collectionSlug: string;
  Event?: ComponentType<{ row: Row }>;
  row: Row;
}) {
  const panel = useRecordPanel();
  const selected = panel.openId === String(row.id);
  const done = isRecordDone(row, getUseAsDone(collectionConfig));
  const { i18n } = useTranslation();
  const { config } = useConfig();
  const title = formatDocTitle({
    collectionConfig,
    data: row,
    dateFormat: config.admin.dateFormat,
    i18n,
  });

  return (
    <div
      className={recordClassName({ done, selected })}
      onAuxClick={(event) => event.button === 1 && panel.open(row.id, event.nativeEvent)}
      onClick={(event) => panel.open(row.id, event.nativeEvent)}
      role="presentation"
    >
      {Event ? (
        <Event row={row} />
      ) : (
        <>
          <div className="collection-calendar__title">
            {done ? <CheckmarkCircleIcon className="fb-record__done-icon" size={14} /> : null}{' '}
            {title}
          </div>
          {cardColumns.map(({ accessor, field }) => (
            <div className="collection-calendar__field" key={accessor}>
              <span className="collection-calendar__field-label">
                {getTranslation(('label' in field ? field.label : undefined) || accessor, i18n)}
              </span>
              <span className="collection-calendar__field-value">
                <FieldCell
                  cellData={getPath(row, accessor)}
                  collectionSlug={collectionSlug}
                  field={field}
                  link={false}
                  rowData={row}
                  viewType="calendar"
                />
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function CalendarViewClient({
  canCreate,
  canUpdate,
  collectionSlug,
  color,
  date,
  dateOnly,
  end,
  endDateOnly,
  Event,
  filter,
  mode,
  modes,
  optionColors,
  snap,
  start,
}: {
  canUpdate: boolean;
  canCreate: boolean;
  collectionSlug: string;
  color?: string;
  date: string;
  dateOnly?: boolean;
  end?: string;
  endDateOnly?: boolean;
  Event?: ComponentType<{ row: Row }>;
  filter?: Record<string, unknown>;
  mode: CalendarMode;
  modes?: CalendarMode[];
  optionColors?: Record<string, OptionColor>;
  snap?: number;
  start: string;
}) {
  const { config, getEntityConfig } = useConfig();
  const { query } = useListQuery();
  const { columns } = useTableColumns();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const collectionConfig = getEntityConfig({ collectionSlug });
  const cardColumns = useMemo(
    () => getViewCardColumns(columns, collectionConfig.admin?.useAsTitle),
    [collectionConfig.admin?.useAsTitle, columns],
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [truncated, setTruncated] = useState(false);
  const panel = useRecordPanel();
  const timeZone = useBrowserTimeZone();
  const zonedRange = timeZone ? getVisibleRange({ date, mode, timeZone }) : undefined;
  const range = zonedRange && dateOnly ? getFloatingRange(zonedRange) : zonedRange;
  const whereKey = JSON.stringify(query.where ?? null);
  const searchKey = String(query.search ?? '');
  const normalizeRow = (row: Record<string, unknown>): Row => ({
    ...row,
    color: color ? resolveEventColor({ optionColors, value: getPath(row, color) }) : undefined,
    end: end ? String(getPath(row, end) ?? '') || undefined : undefined,
    id: String(row.id),
    start: String(getPath(row, start)),
  });

  const load = async (signal?: AbortSignal) => {
    if (!range) return;
    const params = new URLSearchParams({ depth: '1', limit: '1000', pagination: 'false' });
    const rangeWhere = getRangeWhere({ end, range, start });

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

  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const controller = new AbortController();

    void loadRef.current(controller.signal).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error(error instanceof Error ? error.message : 'Failed to load calendar');
    });

    return () => controller.abort();
  }, [collectionSlug, date, mode, searchKey, timeZone, whereKey]);

  useRecordPanelEvents((event) => {
    if (event.type === 'deleted') {
      setRows((current) => current.filter((item) => item.id !== String(event.id)));

      return;
    }

    const saved = normalizeRow(event.doc);

    setRows((current) =>
      current.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...current, saved],
    );
  });

  const navigate = (key: 'date' | 'mode', value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    void router.replace(`${pathname}?${params}`);
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
        item.id === row.id ? { ...item, ...(end ? { end: nextEnd } : {}), start: nextStart } : item,
      ),
    );
  };

  return (
    <RelationshipProvider>
      <div className="collection-calendar">
        {truncated ? (
          <div className="collection-calendar__notice">
            Showing the first 1000 events in this range.
          </div>
        ) : null}
        {timeZone ? (
          <Calendar
            canEdit={() => canUpdate}
            canResize={Boolean(end)}
            date={date}
            dateOnly={dateOnly}
            endDateOnly={endDateOnly}
            events={rows}
            mode={mode}
            modes={modes}
            onCreate={
              canCreate
                ? (value) =>
                    panel.create(
                      mergePaths(
                        setPath(start, value.start),
                        ...(end ? [setPath(end, value.end)] : []),
                      ),
                    )
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
                row={row}
              />
            )}
            snap={snap}
            timeZone={timeZone}
          />
        ) : null}
      </div>
    </RelationshipProvider>
  );
}
