'use client';

import { useEffect, useState } from 'react';

import { formatRowDate } from './rows.js';

/**
 * A row's date, worded in the viewer's own timezone: "Today" and overdue depend on where the
 * person is, not where the server runs, so the label is filled in once the page reaches the browser.
 */
export function RowDate({
  field,
  locale,
  value,
}: {
  field: string;
  locale?: string;
  value: unknown;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => setNow(new Date()), []);

  const date = now ? formatRowDate({ field, locale, now, value }) : null;

  return (
    <time
      className={`fb-query-widget__date${date?.overdue ? ' fb-query-widget__date--overdue' : ''}`}
      dateTime={date?.dateTime ?? (typeof value === 'string' ? value : undefined)}
    >
      {date?.label}
    </time>
  );
}
