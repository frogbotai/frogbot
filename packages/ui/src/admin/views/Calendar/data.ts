import type { CalendarMode, OptionColor } from 'frogbot';
import type { ColumnPreference, FlattenedField } from 'payload';

import { pickOptionColor } from '../../fields/optionColor.js';

const eventBorderColors: Record<OptionColor, string> = {
  blue: 'var(--color-border-selected-strong)',
  gray: 'var(--color-border-strong)',
  green: 'var(--color-border-success-strong)',
  pink: 'var(--color-border-assistive-strong)',
  purple: 'var(--color-border-component-strong)',
  red: 'var(--color-border-danger-strong)',
  yellow: 'var(--color-border-warning-strong)',
};

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

/** The CSS color for an event whose color field holds `value`, from the field's option colors. */
export function resolveEventColor({
  optionColors,
  value,
}: {
  optionColors?: Record<string, OptionColor>;
  value: unknown;
}): string | undefined {
  const first: unknown = Array.isArray(value) ? value[0] : value;

  if (first === undefined || first === null || first === '') return undefined;

  const color = pickOptionColor(optionColors, first);

  return color ? eventBorderColors[color] : undefined;
}
