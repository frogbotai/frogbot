'use client';

import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';

export function CurrentTimeIndicator({
  day,
  hourHeight,
  timeZone,
}: {
  day: string;
  hourHeight: number;
  timeZone: string;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);

    return () => window.clearInterval(interval);
  }, []);

  if (now === null) return null;
  const zoned = new TZDate(now, timeZone);
  if (format(zoned, 'yyyy-MM-dd') !== day) return null;

  return (
    <div
      className="frog-calendar__now"
      style={{ top: (zoned.getHours() + zoned.getMinutes() / 60) * hourHeight }}
    >
      <span />
    </div>
  );
}
