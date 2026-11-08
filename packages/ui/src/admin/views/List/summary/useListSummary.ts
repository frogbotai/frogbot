'use client';

import { useEffect, useState } from 'react';

import type { SummaryRequest } from './summary.js';

type AggregateResponse = { groups?: { values?: Record<string, unknown> }[] };

/**
 * Every column's total from one aggregate request, sent again only when the body changes, so
 * paging doesn't refetch. Keeps the last totals while a request is pending; clears them on failure.
 */
export function useListSummary({
  api,
  body,
  collectionSlug,
}: {
  api: string;
  body: SummaryRequest | undefined;
  collectionSlug: string;
}): Record<string, unknown> | undefined {
  const [values, setValues] = useState<Record<string, unknown>>();
  const key = body ? JSON.stringify(body) : '';

  useEffect(() => {
    if (!key) {
      setValues(undefined);

      return;
    }

    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch(`${api}/${collectionSlug}/aggregate`, {
          body: key,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal: controller.signal,
        });

        const result = response.ok ? ((await response.json()) as AggregateResponse) : undefined;

        if (!controller.signal.aborted) setValues(result?.groups?.[0]?.values);
      } catch {
        if (!controller.signal.aborted) setValues(undefined);
      }
    };

    void load();

    return () => controller.abort();
  }, [api, collectionSlug, key]);

  return values;
}
