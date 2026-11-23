import type { HTMLAttributes } from 'react';

export type ValueFormat =
  'number' | 'compact' | 'currency' | 'percent' | 'date' | 'datetime' | 'relative' | 'duration';

export type ValueFormatOptions = {
  /** ISO currency code for `currency`. Default `USD`. */
  currency?: string;
  /** How the value is shown. Default `number` for numbers, `date` for dates. */
  format?: ValueFormat;
  /** BCP 47 locale. Default the runtime's. */
  locale?: string;
  /** Reference time for `relative`. Default now. */
  now?: Date | number;
};

export type ValueProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> &
  ValueFormatOptions & {
    /** Shown when the value is empty. Default nothing, so empty cells stay blank. */
    empty?: string;
    /** A number, a date, an ISO date string, or `null`. `percent` takes 0.42 for 42%; `duration` takes seconds. */
    value: Date | null | number | string | undefined;
  };

const relativeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

function toDate(value: Date | number | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function relative(date: Date, now: Date | number, locale?: string): string {
  const seconds = Math.round((date.getTime() - Number(now)) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const unit = relativeUnits.find(([, size]) => Math.abs(seconds) >= size);

  if (!unit) return format.format(0, 'minute');

  return format.format(Math.round(seconds / unit[1]), unit[0]);
}

function duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');

  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${rest}`;

  return `${minutes}:${rest}`;
}

function sameYear(date: Date, now: Date | number): boolean {
  return date.getFullYear() === new Date(now).getFullYear();
}

/**
 * Formats a value the way every FrogBot screen shows it: `1.1M`, `$4,120`, `42%`, `Nov 18`,
 * `2 days ago`, `1:02`. Returns an empty string for `null`, `undefined` and `''`.
 */
export function formatValue(
  value: Date | null | number | string | undefined,
  { currency = 'USD', format, locale, now = Date.now() }: ValueFormatOptions = {},
): string {
  if (value === null || value === undefined || value === '') return '';

  const kind = format ?? (typeof value === 'number' ? 'number' : 'date');

  if (kind === 'date' || kind === 'datetime' || kind === 'relative') {
    const date = toDate(value);

    if (Number.isNaN(date.getTime())) return String(value);

    if (kind === 'relative') return relative(date, now, locale);

    return date.toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      ...(sameYear(date, now) ? {} : { year: 'numeric' }),
      ...(kind === 'datetime' ? { hour: 'numeric', minute: '2-digit' } : {}),
    });
  }

  const number = Number(value);

  if (Number.isNaN(number)) return String(value);

  if (kind === 'duration') return duration(number);

  if (kind === 'percent') {
    return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(
      number,
    );
  }

  if (kind === 'currency') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(number) ? 0 : 2,
    }).format(number);
  }

  if (kind === 'compact') {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
      number,
    );
  }

  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(number);
}

/** A formatted number, amount, percent, date or duration, in tabular figures. */
export function Value({
  className,
  currency,
  empty = '',
  format,
  locale,
  now,
  value,
  ...props
}: ValueProps) {
  const text = formatValue(value, { currency, format, locale, now });
  const date = value instanceof Date || (typeof value === 'string' && format !== 'number');
  const title =
    date && text && format !== 'datetime' ? toDate(value).toLocaleString(locale) : undefined;

  return (
    <span
      className={`fb-value${text ? '' : ' fb-value--empty'}${className ? ` ${className}` : ''}`}
      title={title}
      {...props}
    >
      {text || empty}
    </span>
  );
}
