'use client';

import { usePreferences } from '@payloadcms/ui';
import type { ColumnPreference } from 'payload';
import { useEffect } from 'react';

import { getViewPreferenceUpdate } from '../preferences.js';
import type { CalendarPreferenceValue } from './data.js';

export function CalendarPreference({
  collectionSlug,
  columns,
  date,
  mode,
  viewSlug,
}: {
  collectionSlug: string;
  columns?: ColumnPreference[];
  date?: string;
  mode?: CalendarPreferenceValue['mode'];
  viewSlug: string;
}) {
  const { getPreference, setPreference } = usePreferences();
  const serializedColumns = columns ? JSON.stringify(columns) : undefined;

  useEffect(() => {
    if (date === undefined && mode === undefined && serializedColumns === undefined) return;
    const [key, value] = getViewPreferenceUpdate<CalendarPreferenceValue>(
      collectionSlug,
      viewSlug,
      {
        ...(serializedColumns === undefined
          ? {}
          : { columns: JSON.parse(serializedColumns) as ColumnPreference[] }),
        ...(date === undefined ? {} : { date }),
        ...(mode === undefined ? {} : { mode }),
      },
    );
    void getPreference<CalendarPreferenceValue>(key).then((current) =>
      setPreference(key, { ...(current ?? {}), ...value }),
    );
  }, [collectionSlug, date, getPreference, mode, serializedColumns, setPreference, viewSlug]);

  return null;
}
