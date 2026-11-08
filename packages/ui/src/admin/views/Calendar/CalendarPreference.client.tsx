'use client';

import { usePreferences } from '@payloadcms/ui';
import { useEffect } from 'react';

import { getViewPreferenceUpdate } from '../preferences.js';
import type { CalendarPreferenceValue } from './data.js';

export function CalendarPreference({
  collectionSlug,
  date,
  mode,
  viewSlug,
}: {
  collectionSlug: string;
  date?: string;
  mode?: CalendarPreferenceValue['mode'];
  viewSlug: string;
}) {
  const { getPreference, setPreference } = usePreferences();

  useEffect(() => {
    if (date === undefined && mode === undefined) return;
    const [key, value] = getViewPreferenceUpdate<CalendarPreferenceValue>(
      collectionSlug,
      viewSlug,
      {
        ...(date === undefined ? {} : { date }),
        ...(mode === undefined ? {} : { mode }),
      },
    );

    void getPreference<CalendarPreferenceValue>(key).then((current) =>
      setPreference(key, { ...(current ?? {}), ...value }),
    );
  }, [collectionSlug, date, getPreference, mode, setPreference, viewSlug]);

  return null;
}
