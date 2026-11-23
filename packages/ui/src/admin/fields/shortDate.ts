/**
 * A date as Asana writes it: "Nov 24" this year, "Nov 24, 2027" in any other. Returns `undefined`
 * for a value that isn't a valid date.
 */
export function formatShortDate(
  value: unknown,
  { locale = 'en', now = new Date() }: { locale?: string; now?: Date } = {},
): string | undefined {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return undefined;

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
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
