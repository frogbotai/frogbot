import type { ClientField } from 'payload';

/** The zone a timezone date field was saved in, from its `<name>_tz` sibling, as Payload's `DateCell` reads it. */
export function savedTimeZone(field: ClientField, row: unknown): string | undefined {
  if (field.type !== 'date' || !field.timezone || typeof row !== 'object' || row === null) {
    return undefined;
  }

  const zone = (row as Record<string, unknown>)[`${field.name}_tz`];

  return typeof zone === 'string' && zone ? zone : undefined;
}

/**
 * A date as Asana writes it: "Nov 24" this year, "Nov 24, 2027" in any other, in `timeZone` when
 * given and the viewer's zone otherwise. Returns `undefined` for a value that isn't a valid date.
 */
export function formatShortDate(
  value: unknown,
  {
    locale = 'en',
    now = new Date(),
    timeZone,
  }: { locale?: string; now?: Date; timeZone?: string } = {},
): string | undefined {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return undefined;

  const zone = timeZone ? { timeZone } : {};
  const year = new Intl.DateTimeFormat('en', { ...zone, year: 'numeric' });

  return new Intl.DateTimeFormat(locale, {
    ...zone,
    day: 'numeric',
    month: 'short',
    ...(year.format(date) === year.format(now) ? {} : { year: 'numeric' }),
  }).format(date);
}

/** The date-fns `displayFormat` that shows `value` the way `formatShortDate` does. */
export function shortDateDisplayFormat(value: unknown, now = new Date()): string {
  const date =
    value instanceof Date || typeof value === 'string' || typeof value === 'number'
      ? new Date(value)
      : undefined;

  return date && !Number.isNaN(date.getTime()) && date.getFullYear() !== now.getFullYear()
    ? 'MMM d, yyyy'
    : 'MMM d';
}

/** Whether a field is a day-only date with no `displayFormat` of its own, so a short date fits. */
export function isShortDate(field: ClientField): boolean {
  if (field.type !== 'date') return false;

  const date = (field.admin?.date ?? {}) as { displayFormat?: string; pickerAppearance?: string };

  return !date.displayFormat && [undefined, 'default', 'dayOnly'].includes(date.pickerAppearance);
}
