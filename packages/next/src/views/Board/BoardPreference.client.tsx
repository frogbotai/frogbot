'use client';

import { usePreferences } from '@payloadcms/ui';
import { useEffect } from 'react';

import { getBoardPreferenceUpdate } from './data.js';

export function BoardPreference({
  collectionSlug,
  groupBy,
  viewSlug,
}: {
  collectionSlug: string;
  groupBy?: string;
  viewSlug: string;
}) {
  const { getPreference, setPreference } = usePreferences();

  useEffect(() => {
    if (groupBy === undefined) return;
    const [key, value] = getBoardPreferenceUpdate(collectionSlug, viewSlug, groupBy);
    void getPreference<Record<string, unknown>>(key).then((current) =>
      setPreference(key, { ...(current ?? {}), ...value }),
    );
  }, [collectionSlug, getPreference, groupBy, setPreference, viewSlug]);

  return null;
}
