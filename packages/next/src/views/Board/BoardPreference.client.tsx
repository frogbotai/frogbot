'use client';

import { usePreferences } from '@payloadcms/ui';
import { useEffect } from 'react';

import { getBoardPreferenceUpdate } from './data.js';

export function BoardPreference({
  collectionSlug,
  groupBy,
  sort,
  viewSlug,
}: {
  collectionSlug: string;
  groupBy?: string;
  sort?: string;
  viewSlug: string;
}) {
  const { getPreference, setPreference } = usePreferences();

  useEffect(() => {
    if (groupBy === undefined && sort === undefined) return;
    const [key, value] = getBoardPreferenceUpdate(collectionSlug, viewSlug, {
      ...(groupBy === undefined ? {} : { groupBy }),
      ...(sort === undefined ? {} : { sort }),
    });
    void getPreference<Record<string, unknown>>(key).then((current) =>
      setPreference(key, { ...(current ?? {}), ...value }),
    );
  }, [collectionSlug, getPreference, groupBy, setPreference, sort, viewSlug]);

  return null;
}
