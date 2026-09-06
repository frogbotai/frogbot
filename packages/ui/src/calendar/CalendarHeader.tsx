'use client';

import { format } from 'date-fns';

import type { CalendarMode } from './core/index.js';

export function CalendarHeader({
  date,
  mode,
  modes = ['month', 'week', 'day'],
  navigate,
  setMode,
}: {
  date: string;
  mode: CalendarMode;
  modes?: CalendarMode[];
  navigate: (direction: 'next' | 'previous' | 'today') => void;
  setMode?: (mode: CalendarMode) => void;
}) {
  const label = mode === 'day' ? format(date, 'EEEE, MMMM d, yyyy') : format(date, 'MMMM yyyy');
  return (
    <header className="frog-calendar__header">
      <div className="frog-calendar__navigation">
        <button aria-label="Previous" onClick={() => navigate('previous')} type="button">
          ‹
        </button>
        <button onClick={() => navigate('today')} type="button">
          Today
        </button>
        <button aria-label="Next" onClick={() => navigate('next')} type="button">
          ›
        </button>
      </div>
      <strong>{label}</strong>
      <div className="frog-calendar__modes">
        {modes.map((candidate) => (
          <button
            aria-pressed={candidate === mode}
            key={candidate}
            onClick={() => setMode?.(candidate)}
            type="button"
          >
            {candidate}
          </button>
        ))}
      </div>
    </header>
  );
}
