import type { CollectionView } from 'frogbot';
import type { FlattenedField } from 'payload';

const STAMPS = new Set(['createdAt', 'updatedAt']);

const DAY = 86_400_000;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A field a row shows beside its title: a select as a pill, or a number. */
export type RowFact = { field: FlattenedField; kind: 'number' | 'select' };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/** Whether the widget's sort field is a date, which the row shows on the right. No sort field means `updatedAt`. */
export function isDateSort({
  fields,
  sortField,
}: {
  fields: FlattenedField[];
  sortField?: string;
}): boolean {
  if (!sortField || STAMPS.has(sortField)) return true;

  return fields.find(({ name }) => name === sortField)?.type === 'date';
}

/**
 * The facts a dashboard row shows beside its title, the way Linear and Asana rows show status and
 * one number: the first select and the first number from the collection's list view (else its
 * first view with columns). A select or number sort field comes first, so a list sorted by amount
 * shows the amount. The title and a date sort field are skipped: the row already shows them.
 */
export function pickRowFacts({
  fields,
  sortField,
  titleField,
  views,
}: {
  fields: FlattenedField[];
  sortField?: string;
  titleField: string;
  views: Pick<CollectionView, 'defaultFields' | 'type'>[];
}): RowFact[] {
  const withFields = views.filter((view) => view.defaultFields?.length);
  const columns =
    (withFields.find((view) => view.type === 'list') ?? withFields[0])?.defaultFields ?? [];

  const dateSort = isDateSort({ fields, sortField });
  const names = [...(sortField && !dateSort ? [sortField] : []), ...columns].filter(
    (name) => name !== titleField && !(dateSort && name === sortField),
  );

  const facts: RowFact[] = [];

  for (const kind of ['select', 'number'] as const) {
    const field = names
      .map((name) => fields.find((candidate) => candidate.name === name))
      .find(
        (candidate) => candidate?.type === kind && !('hasMany' in candidate && candidate.hasMany),
      );

    if (field) facts.push({ field, kind });
  }

  return facts;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function toDate(value: string): Date {
  const day = DATE_ONLY.exec(value);

  return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
}

/**
 * How a row shows its date. A date people plan around (a due or close date) reads like Asana and
 * Linear: Today, Tomorrow, Yesterday, then `Dec 4`, red once it has passed. A record's own
 * timestamp (`createdAt`, `updatedAt`) reads as time ago, like an activity feed.
 */
export function formatRowDate({
  field,
  locale,
  now = new Date(),
  value,
}: {
  field: string;
  locale?: string;
  now?: Date;
  value: unknown;
}): { dateTime: string; label: string; overdue: boolean } | null {
  let date: Date;

  if (value instanceof Date) date = value;
  else if (typeof value === 'string' && ISO_DATE.test(value)) date = toDate(value);
  else return null;

  if (Number.isNaN(date.getTime())) return null;

  const dateTime = date.toISOString();

  if (STAMPS.has(field)) {
    return { dateTime, label: timeAgo({ date, locale, now }), overdue: false };
  }

  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY);

  if (Math.abs(days) <= 1) {
    const label = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day');

    return {
      dateTime,
      label: label.charAt(0).toLocaleUpperCase(locale) + label.slice(1),
      overdue: days < 0,
    };
  }

  const label = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date);

  return { dateTime, label, overdue: days < 0 };
}

const AGO: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

function timeAgo({ date, locale, now }: { date: Date; locale?: string; now: Date }): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });

  for (const [unit, size] of AGO) {
    if (Math.abs(seconds) >= size) return format.format(Math.trunc(seconds / size), unit);
  }

  return format.format(0, 'minute');
}
