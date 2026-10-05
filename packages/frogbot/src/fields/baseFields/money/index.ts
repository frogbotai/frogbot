import type { NumberField } from '../../config/types.js';
import { applyFieldKind } from '../applyFieldKind.js';
import { describeOptionValue, rejectFieldOptions } from '../rejectFieldOptions.js';
import type { MoneyPrecision } from './formatMoney.js';

export type MoneyFieldArgs = Omit<
  Extract<NumberField, { hasMany?: false | undefined }>,
  'type' | 'hasMany' | 'minRows' | 'maxRows'
> & {
  currency?: string;
  precision?: MoneyPrecision;
};

export function moneyField(args: MoneyFieldArgs): NumberField {
  const { currency = 'USD', precision = 'auto', ...rest } = args;

  rejectFieldOptions({ factory: 'moneyField', field: args, keys: ['hasMany'] });

  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error(
      `moneyField "${args.name}": currency ${describeOptionValue(currency)} must be a three-letter uppercase ISO 4217 code`,
    );
  }

  const validPrecision =
    precision === 'auto' || (Number.isInteger(precision) && precision >= 0 && precision <= 100);

  if (!validPrecision) {
    throw new Error(
      `moneyField "${args.name}": precision must be 'auto' or a whole number from 0 to 100, got ${describeOptionValue(precision)}`,
    );
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
