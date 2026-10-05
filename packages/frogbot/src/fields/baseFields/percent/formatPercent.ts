export type PercentKind = {
  type: 'percent';
  precision: number;
};

export type FormatPercentArgs = {
  value: unknown;
  precision?: number;
  locale?: string;
};

export function formatPercent({
  locale = 'en-US',
  precision = 0,
  value,
}: FormatPercentArgs): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';

  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value === 0 ? 0 : value);
}
