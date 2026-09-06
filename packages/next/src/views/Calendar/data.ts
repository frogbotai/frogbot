import type { CalendarMode } from 'frogbot';
import type { ColumnPreference } from 'payload';

export type CalendarPreferenceValue = {
  columns?: ColumnPreference[];
  date?: string;
  mode?: CalendarMode;
};

export function resolveCalendarMode({
  configuredModes,
  preferenceMode,
  queryMode,
}: {
  configuredModes?: CalendarMode[];
  preferenceMode?: string;
  queryMode?: string;
}): CalendarMode {
  const modes: CalendarMode[] = configuredModes?.length
    ? configuredModes
    : ['month', 'week', 'day'];
  return (
    modes.find((mode) => mode === queryMode) ??
    modes.find((mode) => mode === preferenceMode) ??
    modes[0] ??
    'month'
  );
}

export function resolveCalendarDate({
  preferenceDate,
  queryDate,
  today,
}: {
  preferenceDate?: string;
  queryDate?: string;
  today: string;
}): string {
  return queryDate || preferenceDate || today;
}
