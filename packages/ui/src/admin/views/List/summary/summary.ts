import type { I18nClient } from '@payloadcms/translations';
import { formatDate } from '@payloadcms/ui/shared';
import type { SummaryOperation } from 'frogbot';
import { formatMoney, formatPercent } from 'frogbot/fields';
import type { ClientField, Where } from 'payload';

import { getFieldKind } from '../../../fields/kind.js';

/** A column the footer can total: number columns take every operation, dates their extremes. */
export type SummaryColumn = {
  kind: 'date' | 'number' | 'other';
  operations: readonly SummaryOperation[];
};

/** A saved choice per column; `none` hides a total the view config sets. */
export type SummaryChoice = 'none' | SummaryOperation;

export type SummaryChoices = Record<string, SummaryChoice>;

const choices = new Set<string>(['none', 'count', 'sum', 'avg', 'min', 'max']);

/** The `summary` of a stored view preference, keeping only well-formed choices. */
export function readSummaryChoices(preference: unknown): SummaryChoices {
  const summary: unknown =
    preference && typeof preference === 'object'
      ? (preference as { summary?: unknown }).summary
      : undefined;

  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return {};

  return Object.fromEntries(
    Object.entries(summary).filter(
      (entry): entry is [string, SummaryChoice] =>
        typeof entry[1] === 'string' && choices.has(entry[1]),
    ),
  );
}

/** Each column's total: the user's saved choice, else the view's default, if the column takes it. */
export function resolveSummary({
  columns,
  defaults = {},
  saved,
}: {
  columns: Record<string, SummaryColumn>;
  defaults?: Record<string, SummaryOperation>;
  saved: SummaryChoices;
}): Record<string, SummaryOperation> {
  const resolved: Record<string, SummaryOperation> = {};

  for (const [path, column] of Object.entries(columns)) {
    const choice = saved[path] ?? defaults[path];

    if (choice && choice !== 'none' && column.operations.includes(choice)) resolved[path] = choice;
  }

  return resolved;
}

export type SummaryRequest = {
  draft: true;
  locale?: string;
  values: Record<string, { count: true } | Partial<Record<SummaryOperation, string>>>;
  where?: Where;
};

/** One aggregate body for every visible column with a total, or `undefined` when none has one. */
export function buildSummaryRequest({
  locale,
  paths,
  summary,
  where,
}: {
  /** The admin's content locale, so localized fields total in the language the list shows. */
  locale?: string;
  paths: string[];
  summary: Record<string, SummaryOperation>;
  where: undefined | Where;
}): SummaryRequest | undefined {
  const values: SummaryRequest['values'] = {};

  for (const path of paths) {
    const operation = summary[path];

    if (operation) values[path] = operation === 'count' ? { count: true } : { [operation]: path };
  }

  if (!Object.keys(values).length) return undefined;

  const hasWhere = where && Object.keys(where).length > 0;

  return {
    draft: true,
    ...(locale ? { locale } : {}),
    values,
    ...(hasWhere ? { where } : {}),
  };
}

export function getSummaryLabel(operation: SummaryOperation, kind: SummaryColumn['kind']): string {
  switch (operation) {
    case 'count':
      return 'Count';
    case 'sum':
      return 'Sum';
    case 'avg':
      return 'Average';
    case 'min':
      return kind === 'date' ? 'Earliest' : 'Min';
    case 'max':
      return kind === 'date' ? 'Latest' : 'Max';
  }
}

/** A total as its column's cells show values; empty for no value, so `0` stays distinct from none. */
export function formatSummary({
  dateFormat,
  field,
  i18n,
  kind,
  operation,
  value,
}: {
  /** The admin's `dateFormat`, used when the field sets no `displayFormat`. */
  dateFormat: string;
  field?: ClientField;
  i18n: I18nClient;
  kind: SummaryColumn['kind'];
  operation: SummaryOperation;
  value: unknown;
}): string {
  if (value === null || value === undefined || value === '') return '';

  const locale = i18n.language;

  if (operation === 'count') {
    return typeof value === 'number' ? new Intl.NumberFormat(locale).format(value) : '';
  }

  if (kind === 'date') {
    const pattern =
      (field?.type === 'date'
        ? (field.admin?.date as undefined | { displayFormat?: string })?.displayFormat
        : undefined) ?? dateFormat;

    return typeof value === 'string' ? formatDate({ date: value, i18n, pattern }) : '';
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) return '';

  const fieldKind = field ? getFieldKind(field) : undefined;

  if (fieldKind?.type === 'money') {
    return formatMoney({
      currency: fieldKind.currency as string | undefined,
      locale,
      precision: fieldKind.precision as 'auto' | number | undefined,
      value,
    });
  }

  if (fieldKind?.type === 'percent') {
    return formatPercent({ locale, precision: fieldKind.precision as number | undefined, value });
  }

  return new Intl.NumberFormat(locale).format(value);
}
