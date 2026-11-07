'use client';

import { usePreferences } from '@payloadcms/ui';
import { useState } from 'react';

import type { BoardColumnState } from '../../../board/Board.js';
import { getViewPreferenceKey } from '../preferences.js';
import type { BoardPreferenceValue } from './data.js';

/** Collapsed and hidden columns, remembered per user in the board's view preference. */
export function useBoardColumnState({
  collectionSlug,
  initial,
  viewSlug,
}: {
  collectionSlug: string;
  initial: BoardColumnState;
  viewSlug: string;
}) {
  const { setPreference } = usePreferences();
  const [state, setState] = useState(initial);

  const change = (next: BoardColumnState) => {
    setState(next);

    void setPreference<BoardPreferenceValue>(
      getViewPreferenceKey(collectionSlug, viewSlug),
      (current) => ({ ...current, ...next }),
    );
  };

  return [state, change] as const;
}
