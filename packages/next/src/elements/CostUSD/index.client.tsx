'use client';

import { FieldLabel, useField } from '@payloadcms/ui';

export type CostUSDCellProps = {
  cellData?: unknown;
};

export type CostUSDFieldProps = {
  field: { label?: string };
  path: string;
};

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const subCent = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumSignificantDigits: 3,
});

export function formatCostUSD(value: unknown): string {
  const amount = typeof value === 'number' && Number.isFinite(value) && value !== 0 ? value : 0;

  return amount > 0 && amount < 0.01 ? subCent.format(amount) : dollars.format(amount);
}

export function CostUSDCell({ cellData }: CostUSDCellProps) {
  return <span>{formatCostUSD(cellData)}</span>;
}

export function CostUSDField({ field, path }: CostUSDFieldProps) {
  const { value } = useField<number>({ path });

  return (
    <div className="field-type number">
      <FieldLabel label={field.label} path={path} />
      <div>{formatCostUSD(value)}</div>
    </div>
  );
}
