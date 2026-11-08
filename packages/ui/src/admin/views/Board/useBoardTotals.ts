'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { adjustColumnTotal, type BoardTotalsGroup, toColumnTotals } from './totals.js';

/** Every column's true total from one aggregate query, with optimistic adjustments. */
export function useBoardTotals({
  api,
  collectionSlug,
  groupBy,
  where,
}: {
  api: string;
  collectionSlug: string;
  groupBy: string;
  where: unknown;
}) {
  const [totals, setTotals] = useState<Record<string, number>>();
  const latest = useRef(0);
  const whereRef = useRef(where);

  useEffect(() => {
    whereRef.current = where;
  });

  const refresh = useCallback(async () => {
    const request = ++latest.current;
    const response = await fetch(`${api}/${collectionSlug}/aggregate`, {
      body: JSON.stringify({
        depth: 0,
        draft: true,
        groupBy,
        values: { count: { count: true } },
        ...(whereRef.current ? { where: whereRef.current } : {}),
      }),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    const result = response.ok
      ? ((await response.json()) as { groups: BoardTotalsGroup[] })
      : undefined;

    if (request === latest.current) setTotals(result && toColumnTotals(result.groups, groupBy));
  }, [api, collectionSlug, groupBy]);

  const adjust = useCallback((key: string, delta: number) => {
    latest.current += 1;
    setTotals((current) => (current ? adjustColumnTotal(current, key, delta) : current));
  }, []);

  return { adjust, refresh, totals };
}
