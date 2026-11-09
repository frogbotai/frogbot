'use client';

import { usePreferences } from '@payloadcms/ui';
import { useEffect } from 'react';

import { getViewPreferenceUpdate } from '../preferences.js';
import type { CalendarPreferenceValue } from './data.js';

/** Saves the date and zoom a calendar or timeline was opened at from the URL, for its next visit. */
export function CalendarPreference({
  collectionSlug,
  date,
  mode,
  scale,
  viewSlug,
}: {
  collectionSlug: string;
  date?: string;
  mode?: CalendarPreferenceValue['mode'];
  scale?: CalendarPreferenceValue['scale'];
  viewSlug: string;
}) {
  const { getPreference, setPreference } = usePreferences();

  useEffect(() => {
    if (date === undefined && mode === undefined && scale === undefined) return;
    const [key, value] = getViewPreferenceUpdate<CalendarPreferenceValue>(
      collectionSlug,
      viewSlug,
      {
        ...(date === undefined ? {} : { date }),
        ...(mode === undefined ? {} : { mode }),
        ...(scale === undefined ? {} : { scale }),
      },
    );

    void getPreference<CalendarPreferenceValue>(key).then((current) =>
      setPreference(key, { ...(current ?? {}), ...value }),
    );
  }, [collectionSlug, date, getPreference, mode, scale, setPreference, viewSlug]);

  return null;
}
