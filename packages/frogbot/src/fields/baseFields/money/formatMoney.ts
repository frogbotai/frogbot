import { formatSigned } from '../formatSigned.js';

export type MoneyPrecision = 'auto' | number;

export type MoneyKind = {
  type: 'money';
  currency: string;
  precision: MoneyPrecision;
};

export type FormatMoneyArgs = {
  value: unknown;
  currency?: string;
  precision?: MoneyPrecision;
  locale?: string;
};

export function formatMoney({
  currency = 'USD',
  locale = 'en-US',
  precision = 'auto',
  value,
}: FormatMoneyArgs): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';

  if (precision !== 'auto') {
    const fixed = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });

    return formatSigned(fixed, value);
  }

  const standard = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const digits = standard.resolvedOptions().maximumFractionDigits ?? 2;
  const size = Math.abs(value);

  if (size > 0 && size < 10 ** -digits) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumSignificantDigits: 3,
    }).format(value);
  }

  return formatSigned(standard, value);
}
