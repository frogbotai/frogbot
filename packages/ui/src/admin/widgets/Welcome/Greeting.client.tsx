'use client';

import { useEffect, useState } from 'react';

/** The greeting for the hour: morning from midnight until noon, afternoon until six, evening after. */
export function partOfDay(hour: number): 'afternoon' | 'evening' | 'morning' {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';

  return 'evening';
}

/** Today's date and a greeting in the viewer's own time zone, so it renders after mount. */
export function Greeting({ locale, name }: { locale: string; name?: string }) {
  const [now, setNow] = useState<Date>();

  useEffect(() => setNow(new Date()), []);

  return (
    <section aria-busy={!now} className="fb-welcome">
      <p className="fb-welcome__date">
        {now
          ? new Intl.DateTimeFormat(locale, {
              day: 'numeric',
              month: 'long',
              weekday: 'long',
            }).format(now)
          : ' '}
      </p>
      <h1 className="fb-welcome__heading">
        {now ? `Good ${partOfDay(now.getHours())}${name ? `, ${name}` : ''}` : ' '}
      </h1>
    </section>
  );
}
