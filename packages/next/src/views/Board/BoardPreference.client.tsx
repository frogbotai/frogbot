'use client';

import { usePreferences } from '@payloadcms/ui';
import type { ColumnPreference } from 'payload';
import { useEffect } from 'react';

import { getViewPreferenceUpdate } from '../preferences.js';
import type { BoardPreferenceValue } from './data.js';

export function BoardPreference({
  collectionSlug,
  columns,
  groupBy,
  sort,
  viewSlug,
}: {
  collectionSlug: string;
  columns?: ColumnPreference[];
  groupBy?: string;
  sort?: string;
  viewSlug: string;
}) {
  const { getPreference, setPreference } = usePreferences();
  const serializedColumns = columns ? JSON.stringify(columns) : undefined;

  useEffect(() => {
    if (groupBy === undefined && sort === undefined && serializedColumns === undefined) return;
    const [key, value] = getViewPreferenceUpdate(collectionSlug, viewSlug, {
      ...(serializedColumns === undefined
        ? {}
        : { columns: JSON.parse(serializedColumns) as ColumnPreference[] }),
      ...(groupBy === undefined ? {} : { groupBy }),
      ...(sort === undefined ? {} : { sort }),
    });
    void getPreference<BoardPreferenceValue>(key).then((current) =>
      setPreference(key, { ...(current ?? {}), ...value }),
    );
  }, [collectionSlug, getPreference, groupBy, serializedColumns, setPreference, sort, viewSlug]);

  return null;
}
