'use client';

import {
  RelationshipProvider,
  toast,
  useConfig,
  useListQuery,
  usePathname,
  useRouter,
  useSearchParams,
  useTranslation,
} from '@payloadcms/ui';
import { formatDocTitle } from '@payloadcms/ui/shared';
import type { OptionColor, TimelineScale } from 'frogbot';
import type { ComponentType } from 'react';
import { useEffect, useRef, useState } from 'react';

import { useBrowserTimeZone } from '../../../calendar/useBrowserTimeZone.js';
import { OptionPill } from '../../../components/option-pill.js';
import CheckmarkCircleIcon from '../../../icons/icons/CheckmarkCircleIcon.js';
import { getTimelineRange, type TimelineDateOnly } from '../../../timeline/core.js';
import { Timeline, type TimelineBand } from '../../../timeline/Timeline.js';
import { getRangeWhere, resolveEventColor } from '../Calendar/data.js';
import { appendQuery, getPath, setPath, toCellData } from '../cells.js';
import { getGroupValueKey } from '../groups/keys.js';
import type { ResolvedGroup } from '../groups/resolve.js';
import { useRecordPanel, useRecordPanelEvents } from '../panel/RecordPanelProvider.client.js';
import { getUseAsDone, isRecordDone, recordClassName } from '../records/state.js';

/** A record as the timeline holds it: the document plus its bar's dates and color. */
export type TimelineRow = Record<string, unknown> & {
  color?: string;
  end?: string;
  id: string;
  start?: string;
};

const LIMIT = 1000;
const DAY = 86_400_000;

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

function readDate(row: Record<string, unknown>, path: string | undefined): string | undefined {
  if (!path) return undefined;
  const value = getPath(row, path);

  return typeof value === 'string' && value ? value : undefined;
}

function TimelineBarBody({ done, title }: { done: boolean; title: string }) {
  return (
    <span className="collection-timeline__title">
      {done ? <CheckmarkCircleIcon className="fb-record__done-icon" size={14} /> : null} {title}
    </span>
  );
}

export function TimelineViewClient({
  Bar,
  canUpdate,
  collectionSlug,
  color,
  date,
  dateOnly,
  end,
  filter,
  groupBy,
  groups,
  noValueLabel,
  optionColors,
  scale,
  scales,
  start,
}: {
  Bar?: ComponentType<{ row: TimelineRow }>;
  canUpdate: boolean;
  collectionSlug: string;
  color?: string;
  date: string;
  dateOnly: TimelineDateOnly;
  end?: string;
  filter?: Record<string, unknown>;
  groupBy?: string;
  groups?: ResolvedGroup[];
  noValueLabel: string;
  optionColors?: Record<string, OptionColor>;
  scale: TimelineScale;
  scales: TimelineScale[];
  start: string;
}) {
  const { config, getEntityConfig } = useConfig();
  const { i18n } = useTranslation();
  const { query } = useListQuery();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const collectionConfig = getEntityConfig({ collectionSlug });
  const useAsDone = getUseAsDone(collectionConfig);
  const panel = useRecordPanel();
  const timeZone = useBrowserTimeZone();
  const [rows, setRows] = useState<TimelineRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const whereKey = JSON.stringify(query.where ?? null);
  const searchKey = String(query.search ?? '');

  const normalizeRow = (row: Record<string, unknown>): TimelineRow => ({
    ...row,
    color: color ? resolveEventColor({ optionColors, value: getPath(row, color) }) : undefined,
    end: readDate(row, end),
    id: String(row.id),
    start: readDate(row, start),
  });

  const load = async (signal?: AbortSignal) => {
    if (!timeZone) return;
    const visible = getTimelineRange({ date, scale, timeZone });
    const range = {
      end: new Date(Date.parse(visible.end) + DAY).toISOString(),
      start: new Date(Date.parse(visible.start) - DAY).toISOString(),
    };

    const params = new URLSearchParams({ depth: '1', limit: String(LIMIT), pagination: 'false' });
    const rangeWhere = getRangeWhere({ end, endOnly: true, range, start });

    appendQuery(params, 'where', { and: [filter, query.where, rangeWhere].filter(Boolean) });
    appendQuery(params, 'search', query.search);
    const response = await fetch(`${config.routes.api}/${collectionSlug}?${params}`, {
      credentials: 'include',
      signal,
    });

    if (!response.ok) throw new Error(response.statusText);
    const result = (await response.json()) as { docs: TimelineRow[]; totalDocs?: number };

    setRows(result.docs.map(normalizeRow));

    setTruncated(
      (result.totalDocs ?? result.docs.length) > result.docs.length || result.docs.length >= LIMIT,
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
      toast.error(error instanceof Error ? error.message : 'Failed to load timeline');
    });

    return () => controller.abort();
  }, [collectionSlug, date, scale, searchKey, timeZone, whereKey]);

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

  const getBand = (row: TimelineRow) => {
    if (!groupBy) return '';
    const value = getPath(row, groupBy);

    return getGroupValueKey(Array.isArray(value) ? value[0] : value);
  };

  const getBands = (): TimelineBand[] | undefined => {
    if (!groupBy) return undefined;
    const listed: TimelineBand[] = (groups ?? []).map((group) => ({
      key: group.key,
      label: group.color ? <OptionPill color={group.color}>{group.label}</OptionPill> : group.label,
    }));

    const known = new Set(listed.map((band) => band.key));
    const extra: TimelineBand[] = [];

    for (const row of rows) {
      const key = getBand(row);
      if (known.has(key)) continue;
      known.add(key);
      const value = toCellData(getPath(row, groupBy));

      extra.push({ key, label: key === '' ? noValueLabel : String(value) });
    }

    return [
      ...listed,
      ...extra.filter(({ key }) => key !== ''),
      ...extra.filter(({ key }) => key === ''),
    ];
  };

  const navigate = (key: 'date' | 'scale', value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    void router.replace(`${pathname}?${params}`);
  };

  const save = async ({
    end: nextEnd,
    item,
    start: nextStart,
  }: {
    end?: string;
    item: TimelineRow;
    start?: string;
  }) => {
    const body = mergePaths(
      ...(nextStart === undefined ? [] : [setPath(start, nextStart)]),
      ...(end && nextEnd !== undefined ? [setPath(end, nextEnd)] : []),
    );

    const response = await fetch(`${config.routes.api}/${collectionSlug}/${item.id}`, {
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
      current.map((row) =>
        row.id === item.id ? { ...row, end: end ? nextEnd : undefined, start: nextStart } : row,
      ),
    );
  };

  return (
    <RelationshipProvider>
      <div className="collection-timeline">
        {truncated ? (
          <div className="collection-calendar__notice">
            Showing the first {LIMIT} records in this range.
          </div>
        ) : null}
        {timeZone ? (
          <Timeline
            bands={getBands()}
            barClassName={(row) =>
              recordClassName({
                done: isRecordDone(row, useAsDone),
                selected: panel.openId === row.id,
              })
            }
            canEdit={() => canUpdate}
            canResize={Boolean(end)}
            date={date}
            dateOnly={dateOnly}
            getBand={getBand}
            items={rows}
            onMove={save}
            onNavigate={(value) => navigate('date', value)}
            onOpen={(row, event) =>
              panel.open(
                row.id,
                event.nativeEvent instanceof MouseEvent ? event.nativeEvent : undefined,
              )
            }
            onResize={save}
            onSetScale={(value) => navigate('scale', value)}
            renderBar={(row) =>
              Bar ? (
                <Bar row={row} />
              ) : (
                <TimelineBarBody
                  done={isRecordDone(row, useAsDone)}
                  title={formatDocTitle({
                    collectionConfig,
                    data: row,
                    dateFormat: config.admin.dateFormat,
                    i18n,
                  })}
                />
              )
            }
            scale={scale}
            scales={scales}
            timeZone={timeZone}
          />
        ) : null}
      </div>
    </RelationshipProvider>
  );
}
