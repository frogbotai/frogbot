'use client';

import { FieldLabel, useField } from '@payloadcms/ui';

export function formatCostUSD(value: unknown): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(typeof value === 'number' ? value : 0);
}

export function CostUSDCell({ cellData }: { cellData?: unknown }) {
  return <span>{formatCostUSD(cellData)}</span>;
}

export function CostUSDField({ field, path }: { field: { label?: string }; path: string }) {
  const { value } = useField<number>({ path });

  return (
    <div className="field-type number">
      <FieldLabel label={field.label} path={path} />
      <div>{formatCostUSD(value)}</div>
    </div>
  );
}
