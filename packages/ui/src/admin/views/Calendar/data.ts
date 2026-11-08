import type { CalendarMode } from 'frogbot';
import type { ColumnPreference, FlattenedField } from 'payload';

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

/**
 * A date field set to pick only a day or a month: Payload stores its values at 12:00 UTC. A plain
 * date field can hold any instant, such as `createdAt` or a hook's timestamp, so it counts as timed.
 */
export function isDateOnly(field: FlattenedField | undefined): boolean {
  if (field?.type !== 'date') return false;
  const appearance = field.admin?.date?.pickerAppearance;

  return appearance === 'dayOnly' || appearance === 'monthOnly';
}
