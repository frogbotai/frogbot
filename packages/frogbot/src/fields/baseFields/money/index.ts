import type { NumberField } from '../../config/types.js';
import { applyFieldKind } from '../applyFieldKind.js';
import type { MoneyPrecision } from './formatMoney.js';

export type MoneyFieldArgs = Omit<
  Extract<NumberField, { hasMany?: false | undefined }>,
  'type' | 'hasMany' | 'minRows' | 'maxRows'
> & {
  currency?: string;
  precision?: MoneyPrecision;
};

function describeValue(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value);
}

export function moneyField(args: MoneyFieldArgs): NumberField {
  const { currency = 'USD', precision = 'auto', ...rest } = args;

  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error(
      `moneyField "${args.name}": currency ${describeValue(currency)} must be a three-letter uppercase ISO 4217 code`,
    );
  }

  const validPrecision =
    precision === 'auto' || (Number.isInteger(precision) && precision >= 0 && precision <= 100);

  if (!validPrecision) {
    throw new Error(
      `moneyField "${args.name}": precision must be 'auto' or a whole number from 0 to 100, got ${describeValue(precision)}`,
    );
  }

  if ('hasMany' in args && args.hasMany) {
    throw new Error(`moneyField "${args.name}": hasMany is not supported`);
  }

  return applyFieldKind(
    { ...rest, type: 'number' },
    {
      kind: { type: 'money', currency, precision },
      cell: true,
      Field: '@frogbotai/next/client#MoneyField',
      description: `Decimal amount in ${currency}, in whole units, not minor units such as cents`,
    },
  );
}
