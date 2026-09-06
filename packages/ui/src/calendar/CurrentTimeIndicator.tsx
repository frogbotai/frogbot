'use client';

import { useEffect, useState } from 'react';

export function CurrentTimeIndicator({ day, hourHeight }: { day: string; hourHeight: number }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  if (!now || now.toISOString().slice(0, 10) !== day) return null;
  return (
    <div
      className="frog-calendar__now"
      style={{ top: (now.getHours() + now.getMinutes() / 60) * hourHeight }}
    >
      <span />
    </div>
  );
}
